import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AppDataSnapshot } from '../types';
import {
  canonicalSnapshotDigest,
  migrateAppData,
  validateReferentialIntegrity,
} from '../app/appDataRepository';
import {
  classifyBroadcast,
  createUploadIntent,
  decideBootstrapSync,
  loadSyncMeta,
  markSyncComplete,
  saveSyncMeta,
  type LocalSyncMeta,
} from './cloudSyncModel';

export type CloudSyncStatus =
  | 'unconfigured'
  | 'signed_out'
  | 'checking'
  | 'syncing'
  | 'synced'
  | 'upload_confirmation_required'
  | 'upgrade_required'
  | 'conflict'
  | 'offline'
  | 'error'
  | 'demo';

const hasUserRecords = (snapshot: AppDataSnapshot) =>
  snapshot.moments.length > 0 || snapshot.notes.length > 0;

type SafeSnapshotResult =
  | { status: 'ok'; snapshot: AppDataSnapshot }
  | { status: 'upgrade_required'; sourceVersion: number }
  | { status: 'invalid' };

const safeSnapshot = (value: unknown): SafeSnapshotResult => {
  const migrated = migrateAppData(value);
  if (migrated.status === 'upgrade_required') return migrated;
  if (
    migrated.status !== 'ok' ||
    migrated.snapshot.dataMode !== 'real' ||
    validateReferentialIntegrity(migrated.snapshot).length > 0
  ) {
    return { status: 'invalid' };
  }
  return { status: 'ok', snapshot: migrated.snapshot };
};

const requestId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const localDeviceId = () => {
  const key = 'my-emotion-map.device-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = requestId();
  window.localStorage.setItem(key, created);
  return created;
};

const saveRecoveryCopies = (
  userId: string,
  local: AppDataSnapshot,
  remote: AppDataSnapshot,
) => {
  try {
    const deviceId = localDeviceId();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = `my-emotion-map:recovery:${deviceId}:${timestamp}`;
    window.localStorage.setItem(`${prefix}:conflict-local-${userId}`, JSON.stringify(local));
    window.localStorage.setItem(`${prefix}:conflict-remote-${userId}`, JSON.stringify(remote));
    const recoveryKeys = Object.keys(window.localStorage)
      .filter((key) => key.startsWith(`my-emotion-map:recovery:${deviceId}:`))
      .sort()
      .reverse();
    recoveryKeys.slice(8).forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // A conflict remains paused even when recovery storage is unavailable.
  }
};

export function useCloudSync({
  client,
  session,
  snapshot,
  applySnapshot,
  blockedByFutureSchema = false,
}: {
  client: SupabaseClient | null;
  session: Session | null;
  snapshot: AppDataSnapshot;
  applySnapshot: (snapshot: AppDataSnapshot) => void;
  blockedByFutureSchema?: boolean;
}) {
  const [status, setStatus] = useState<CloudSyncStatus>(client ? 'signed_out' : 'unconfigured');
  const [revision, setRevision] = useState<number | null>(null);
  const [uploadedSnapshot, setUploadedSnapshot] = useState('');
  const activeUserRef = useRef('');
  const conflictRemoteRef = useRef<{ snapshot: AppDataSnapshot; revision: number } | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const snapshotRef = useRef(snapshot);
  const applySnapshotRef = useRef(applySnapshot);
  const syncMetaRef = useRef<LocalSyncMeta | null>(null);
  const generationRef = useRef(0);
  const pendingAppliedHashRef = useRef('');
  const [instanceId] = useState(requestId);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    applySnapshotRef.current = applySnapshot;
  }, [applySnapshot]);

  const persistMeta = useCallback((userId: string, meta: LocalSyncMeta) => {
    syncMetaRef.current = meta;
    saveSyncMeta(userId, meta);
  }, []);

  const acceptRemote = useCallback((
    userId: string,
    remote: AppDataSnapshot,
    remoteRevision: number,
  ) => {
    const digest = canonicalSnapshotDigest(remote);
    persistMeta(userId, markSyncComplete({ revision: remoteRevision, payloadHash: digest }));
    setUploadedSnapshot(digest);
    pendingAppliedHashRef.current = digest;
    window.localStorage.setItem(`my-emotion-map.cloud-revision.${userId}`, String(remoteRevision));
    applySnapshotRef.current(remote);
    setRevision(remoteRevision);
    setStatus('synced');
  }, [persistMeta]);

  useEffect(() => {
    channelRef.current?.close();
    channelRef.current = null;
    const userId = session?.user.id;
    if (!client || !userId || blockedByFutureSchema || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(`my-emotion-map-sync:${userId}`);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== 'object') return;
      const message = event.data as {
        type?: unknown;
        userId?: unknown;
        revision?: unknown;
        hash?: unknown;
      };
      if (message.type !== 'synced_snapshot' || message.userId !== userId) return;
      const incomingRevision = Number(message.revision);
      if (
        typeof message.hash !== 'string' ||
        !message.hash ||
        !Number.isSafeInteger(incomingRevision) ||
        incomingRevision < 1
      ) return;
      const meta = syncMetaRef.current ?? loadSyncMeta(userId);
      if (meta && incomingRevision < meta.baseRevision) return;
      const localHash = canonicalSnapshotDigest(snapshotRef.current);
      const classification = classifyBroadcast({
        localHash,
        incomingHash: message.hash,
        meta,
      });
      if (classification === 'ignore') return;

      const requestGeneration = generationRef.current;
      if (classification === 'conflict') setStatus('conflict');
      void client
        .from('app_states')
        .select('revision,payload')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (
            error ||
            generationRef.current !== requestGeneration ||
            activeUserRef.current !== userId
          ) return;
          const remoteResult = safeSnapshot(data?.payload);
          const remoteRevision = Number(data?.revision);
          if (remoteResult.status === 'upgrade_required') {
            setStatus('upgrade_required');
            return;
          }
          if (
            remoteResult.status !== 'ok' ||
            !Number.isSafeInteger(remoteRevision) ||
            remoteRevision < 1
          ) return;
          const remote = remoteResult.snapshot;
          const remoteHash = canonicalSnapshotDigest(remote);
          if (remoteRevision !== incomingRevision || remoteHash !== message.hash) return;

          const currentLocal = snapshotRef.current;
          const currentLocalHash = canonicalSnapshotDigest(currentLocal);
          const currentMeta = syncMetaRef.current ?? loadSyncMeta(userId);
          const currentClassification = classifyBroadcast({
            localHash: currentLocalHash,
            incomingHash: remoteHash,
            meta: currentMeta,
          });
          if (classification === 'conflict' || currentClassification === 'conflict') {
            saveRecoveryCopies(userId, currentLocal, remote);
            conflictRemoteRef.current = { snapshot: remote, revision: remoteRevision };
            if (currentMeta) persistMeta(userId, { ...currentMeta, dirty: true });
            setRevision(remoteRevision);
            setStatus('conflict');
            return;
          }
          if (currentClassification === 'fetch_remote') {
            acceptRemote(userId, remote, remoteRevision);
          }
        });
    };
    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [acceptRemote, blockedByFutureSchema, client, persistMeta, session?.user.id]);

  useEffect(() => {
    if (!client) {
      generationRef.current += 1;
      activeUserRef.current = '';
      syncMetaRef.current = null;
      setUploadedSnapshot('');
      conflictRemoteRef.current = null;
      setStatus('unconfigured');
      setRevision(null);
      return;
    }
    if (!session) {
      generationRef.current += 1;
      activeUserRef.current = '';
      syncMetaRef.current = null;
      setUploadedSnapshot('');
      conflictRemoteRef.current = null;
      setStatus('signed_out');
      setRevision(null);
      return;
    }
    if (blockedByFutureSchema) {
      generationRef.current += 1;
      activeUserRef.current = session.user.id;
      syncMetaRef.current = loadSyncMeta(session.user.id);
      setUploadedSnapshot('');
      conflictRemoteRef.current = null;
      setStatus('upgrade_required');
      setRevision(null);
      return;
    }
    if (snapshot.dataMode === 'demo') {
      setStatus('demo');
      setRevision(null);
      return;
    }
    let cancelled = false;
    const userId = session.user.id;
    generationRef.current += 1;
    const requestGeneration = generationRef.current;
    activeUserRef.current = userId;
    syncMetaRef.current = loadSyncMeta(userId);
    conflictRemoteRef.current = null;
    setStatus('checking');
    void client
      .from('app_states')
      .select('revision,payload')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (
          cancelled ||
          generationRef.current !== requestGeneration ||
          activeUserRef.current !== userId
        ) return;
        if (error) {
          setStatus(navigator.onLine ? 'error' : 'offline');
          return;
        }
        if (!data) {
          setRevision(0);
          const needsConfirmation = hasUserRecords(snapshot);
          setUploadedSnapshot('');
          const existingMeta = syncMetaRef.current;
          persistMeta(userId, {
            baseRevision: 0,
            baseHash: '',
            pendingRequestId: existingMeta?.pendingRequestId ?? null,
            pendingPayloadHash: existingMeta?.pendingPayloadHash ?? null,
            dirty: true,
            lastSyncedAt: existingMeta?.lastSyncedAt ?? null,
          });
          setStatus(needsConfirmation ? 'upload_confirmation_required' : 'synced');
          return;
        }
        const remoteResult = safeSnapshot(data.payload);
        const remoteRevision = Number(data.revision);
        if (remoteResult.status === 'upgrade_required') {
          setRevision(
            Number.isSafeInteger(remoteRevision) && remoteRevision >= 1
              ? remoteRevision
              : null,
          );
          setStatus('upgrade_required');
          return;
        }
        if (
          remoteResult.status !== 'ok' ||
          !Number.isSafeInteger(remoteRevision) ||
          remoteRevision < 1
        ) {
          setStatus('error');
          return;
        }
        const remote = remoteResult.snapshot;
        const localHash = canonicalSnapshotDigest(snapshot);
        const remoteHash = canonicalSnapshotDigest(remote);
        const decision = decideBootstrapSync({
          localHash,
          remoteHash,
          remoteRevision,
          localHasRecords: hasUserRecords(snapshot),
          meta: syncMetaRef.current,
        });
        if (decision === 'synced') {
          persistMeta(userId, markSyncComplete({ revision: remoteRevision, payloadHash: remoteHash }));
          setUploadedSnapshot(remoteHash);
          window.localStorage.setItem(`my-emotion-map.cloud-revision.${userId}`, String(remoteRevision));
          setRevision(remoteRevision);
          setStatus('synced');
          return;
        }
        if (decision === 'use_remote') {
          acceptRemote(userId, remote, remoteRevision);
          return;
        }
        if (decision === 'upload_local') {
          const existingMeta = syncMetaRef.current;
          const reusablePending = existingMeta?.pendingPayloadHash === localHash
            ? {
                pendingRequestId: existingMeta.pendingRequestId,
                pendingPayloadHash: existingMeta.pendingPayloadHash,
              }
            : {
                pendingRequestId: null,
                pendingPayloadHash: null,
              };
          persistMeta(userId, {
            ...markSyncComplete({ revision: remoteRevision, payloadHash: remoteHash }),
            ...reusablePending,
            dirty: true,
          });
          setUploadedSnapshot(remoteHash);
          setRevision(remoteRevision);
          setStatus('synced');
          return;
        }
        saveRecoveryCopies(userId, snapshot, remote);
        conflictRemoteRef.current = { snapshot: remote, revision: remoteRevision };
        if (syncMetaRef.current) {
          persistMeta(userId, { ...syncMetaRef.current, dirty: true });
        }
        setRevision(remoteRevision);
        setStatus('conflict');
      });
    return () => { cancelled = true; };
    // Snapshot is intentionally sampled only when a session is first checked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptRemote, blockedByFutureSchema, client, persistMeta, session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || snapshot.dataMode !== 'real') return;
    const digest = canonicalSnapshotDigest(snapshot);
    if (pendingAppliedHashRef.current) {
      if (pendingAppliedHashRef.current === digest) pendingAppliedHashRef.current = '';
      else return;
    }
    const meta = syncMetaRef.current;
    if (!meta) return;
    const dirty = digest !== meta.baseHash || Boolean(meta.pendingRequestId);
    if (dirty !== meta.dirty) persistMeta(userId, { ...meta, dirty });
  }, [persistMeta, session?.user.id, snapshot]);

  useEffect(() => {
    if (!client || !session || status !== 'synced' || revision === null || snapshot.dataMode !== 'real') return;
    const serialized = canonicalSnapshotDigest(snapshot);
    if (serialized === uploadedSnapshot) return;
    if (pendingAppliedHashRef.current && pendingAppliedHashRef.current !== serialized) return;
    const timer = window.setTimeout(() => {
      const userId = session.user.id;
      const requestGeneration = generationRef.current;
      const intent = createUploadIntent(syncMetaRef.current, serialized, requestId);
      persistMeta(userId, intent.meta);
      setStatus('syncing');
      void Promise.resolve(client.rpc('save_app_state', {
        p_expected_revision: revision,
        p_request_id: intent.requestId,
        p_schema_version: snapshot.schemaVersion,
        p_payload: snapshot,
      })).then(({ data, error }) => {
        if (
          generationRef.current !== requestGeneration ||
          activeUserRef.current !== userId
        ) return;
        if (error) {
          if (!navigator.onLine) {
            setStatus('offline');
            return;
          }
          if (error.code !== '40001') {
            setStatus('error');
            return;
          }
          setStatus('conflict');
          void client
            .from('app_states')
            .select('revision,payload')
            .eq('user_id', userId)
            .maybeSingle()
            .then(({ data: remoteData }) => {
              const remoteResult = safeSnapshot(remoteData?.payload);
              const remoteRevision = Number(remoteData?.revision);
              if (remoteResult.status === 'upgrade_required') {
                setStatus('upgrade_required');
                return;
              }
              if (
                remoteResult.status !== 'ok' ||
                !Number.isSafeInteger(remoteRevision) ||
                remoteRevision < 1
              ) return;
              const remote = remoteResult.snapshot;
              saveRecoveryCopies(userId, snapshot, remote);
              conflictRemoteRef.current = { snapshot: remote, revision: remoteRevision };
              const currentMeta = syncMetaRef.current;
              if (currentMeta) persistMeta(userId, { ...currentMeta, dirty: true });
              setRevision(remoteRevision);
            });
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        const nextRevision = Number(row?.revision);
        if (!Number.isSafeInteger(nextRevision) || nextRevision < 1) {
          setStatus('error');
          return;
        }
        const currentHash = canonicalSnapshotDigest(snapshotRef.current);
        const completedMeta = markSyncComplete({ revision: nextRevision, payloadHash: serialized });
        persistMeta(userId, currentHash === serialized
          ? completedMeta
          : { ...completedMeta, dirty: true });
        setUploadedSnapshot(serialized);
        window.localStorage.setItem(`my-emotion-map.cloud-revision.${userId}`, String(nextRevision));
        setRevision(nextRevision);
        setStatus('synced');
        channelRef.current?.postMessage({
          type: 'synced_snapshot',
          userId,
          revision: nextRevision,
          hash: serialized,
          generation: instanceId,
        });
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [client, instanceId, persistMeta, revision, session, snapshot, status, uploadedSnapshot]);

  useEffect(() => {
    if (!client || !session || status !== 'offline' || revision === null || snapshot.dataMode !== 'real') return;
    const resume = () => setStatus('synced');
    window.addEventListener('online', resume);
    return () => window.removeEventListener('online', resume);
  }, [client, revision, session, snapshot.dataMode, status]);

  const confirmInitialUpload = () => {
    if (status === 'upload_confirmation_required' && revision === 0) setStatus('synced');
  };

  const useRemoteVersion = () => {
    const remote = conflictRemoteRef.current;
    if (!session || !remote) return;
    const digest = canonicalSnapshotDigest(remote.snapshot);
    acceptRemote(session.user.id, remote.snapshot, remote.revision);
    channelRef.current?.postMessage({
      type: 'synced_snapshot',
      userId: session.user.id,
      revision: remote.revision,
      hash: digest,
      generation: instanceId,
    });
  };

  const overwriteRemoteWithLocal = () => {
    const remote = conflictRemoteRef.current;
    if (!session || !remote) return;
    const remoteHash = canonicalSnapshotDigest(remote.snapshot);
    persistMeta(session.user.id, {
      ...markSyncComplete({ revision: remote.revision, payloadHash: remoteHash }),
      dirty: true,
    });
    setUploadedSnapshot(remoteHash);
    setRevision(remote.revision);
    setStatus('synced');
  };

  const serializedSnapshot = canonicalSnapshotDigest(snapshot);
  const safeRevision = status === 'synced' && serializedSnapshot === uploadedSnapshot
    ? revision
    : null;

  return {
    status,
    revision: safeRevision,
    confirmInitialUpload,
    useRemoteVersion,
    overwriteRemoteWithLocal,
  };
}
