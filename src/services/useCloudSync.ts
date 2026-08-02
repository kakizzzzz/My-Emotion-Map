import { useEffect, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AppDataSnapshot } from '../types';
import {
  canonicalSnapshotDigest,
  migrateAppData,
  validateReferentialIntegrity,
} from '../app/appDataRepository';

export type CloudSyncStatus =
  | 'unconfigured'
  | 'signed_out'
  | 'checking'
  | 'syncing'
  | 'synced'
  | 'upload_confirmation_required'
  | 'conflict'
  | 'offline'
  | 'error'
  | 'demo';

const hasUserRecords = (snapshot: AppDataSnapshot) =>
  snapshot.moments.length > 0 || snapshot.notes.length > 0;

const safeSnapshot = (value: unknown): AppDataSnapshot | null => {
  const migrated = migrateAppData(value).snapshot;
  return migrated.dataMode === 'real' &&
    validateReferentialIntegrity(migrated).length === 0
    ? migrated
    : null;
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
}: {
  client: SupabaseClient | null;
  session: Session | null;
  snapshot: AppDataSnapshot;
  applySnapshot: (snapshot: AppDataSnapshot) => void;
}) {
  const [status, setStatus] = useState<CloudSyncStatus>(client ? 'signed_out' : 'unconfigured');
  const [revision, setRevision] = useState<number | null>(null);
  const [uploadedSnapshot, setUploadedSnapshot] = useState('');
  const activeUserRef = useRef('');
  const conflictRemoteRef = useRef<{ snapshot: AppDataSnapshot; revision: number } | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    channelRef.current?.close();
    channelRef.current = null;
    const userId = session?.user.id;
    if (!userId || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(`my-emotion-map-sync:${userId}`);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== 'object') return;
      const message = event.data as {
        type?: unknown;
        userId?: unknown;
        revision?: unknown;
        snapshot?: unknown;
      };
      if (message.type !== 'synced_snapshot' || message.userId !== userId) return;
      const incomingRevision = Number(message.revision);
      const incoming = safeSnapshot(message.snapshot);
      if (!incoming || !Number.isSafeInteger(incomingRevision) || incomingRevision < 1) return;
      if (revision !== null && incomingRevision < revision) return;
      const digest = canonicalSnapshotDigest(incoming);
      if (digest === canonicalSnapshotDigest(snapshot)) return;
      setUploadedSnapshot(digest);
      window.localStorage.setItem(`my-emotion-map.cloud-revision.${userId}`, String(incomingRevision));
      applySnapshot(incoming);
      setRevision(incomingRevision);
      setStatus('synced');
    };
    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [applySnapshot, revision, session?.user.id, snapshot]);

  useEffect(() => {
    if (!client) {
      setUploadedSnapshot('');
      conflictRemoteRef.current = null;
      setStatus('unconfigured');
      setRevision(null);
      return;
    }
    if (!session) {
      activeUserRef.current = '';
      setUploadedSnapshot('');
      conflictRemoteRef.current = null;
      setStatus('signed_out');
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
    activeUserRef.current = userId;
    conflictRemoteRef.current = null;
    setStatus('checking');
    void client
      .from('app_states')
      .select('revision,payload')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || activeUserRef.current !== userId) return;
        if (error) {
          setStatus(navigator.onLine ? 'error' : 'offline');
          return;
        }
        if (!data) {
          setRevision(0);
          const needsConfirmation = hasUserRecords(snapshot);
          setUploadedSnapshot(needsConfirmation ? '' : canonicalSnapshotDigest(snapshot));
          setStatus(needsConfirmation ? 'upload_confirmation_required' : 'synced');
          return;
        }
        const remote = safeSnapshot(data.payload);
        const remoteRevision = Number(data.revision);
        if (!remote || !Number.isSafeInteger(remoteRevision) || remoteRevision < 1) {
          setStatus('error');
          return;
        }
        const revisionKey = `my-emotion-map.cloud-revision.${userId}`;
        const knownRevision = Number(window.localStorage.getItem(revisionKey));
        if (knownRevision === remoteRevision) {
          setUploadedSnapshot(canonicalSnapshotDigest(remote));
          setRevision(remoteRevision);
          setStatus('synced');
          return;
        }
        if (canonicalSnapshotDigest(snapshot) === canonicalSnapshotDigest(remote)) {
          setUploadedSnapshot(canonicalSnapshotDigest(remote));
          window.localStorage.setItem(revisionKey, String(remoteRevision));
          setRevision(remoteRevision);
          setStatus('synced');
          return;
        }
        if (!hasUserRecords(snapshot)) {
          setUploadedSnapshot(canonicalSnapshotDigest(remote));
          window.localStorage.setItem(revisionKey, String(remoteRevision));
          applySnapshot(remote);
          setRevision(remoteRevision);
          setStatus('synced');
          return;
        }
        saveRecoveryCopies(userId, snapshot, remote);
        conflictRemoteRef.current = { snapshot: remote, revision: remoteRevision };
        setRevision(remoteRevision);
        setStatus('conflict');
      });
    return () => { cancelled = true; };
    // Snapshot is intentionally sampled only when a session is first checked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applySnapshot, client, session?.user.id]);

  useEffect(() => {
    if (!client || !session || status !== 'synced' || revision === null || snapshot.dataMode !== 'real') return;
    const serialized = canonicalSnapshotDigest(snapshot);
    if (serialized === uploadedSnapshot) return;
    const timer = window.setTimeout(() => {
      setStatus('syncing');
      void client.rpc('save_app_state', {
        p_expected_revision: revision,
        p_request_id: requestId(),
        p_schema_version: snapshot.schemaVersion,
        p_payload: snapshot,
      }).then(({ data, error }) => {
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
            .eq('user_id', session.user.id)
            .maybeSingle()
            .then(({ data: remoteData }) => {
              const remote = safeSnapshot(remoteData?.payload);
              const remoteRevision = Number(remoteData?.revision);
              if (!remote || !Number.isSafeInteger(remoteRevision) || remoteRevision < 1) return;
              saveRecoveryCopies(session.user.id, snapshot, remote);
              conflictRemoteRef.current = { snapshot: remote, revision: remoteRevision };
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
        setUploadedSnapshot(serialized);
        window.localStorage.setItem(`my-emotion-map.cloud-revision.${session.user.id}`, String(nextRevision));
        setRevision(nextRevision);
        setStatus('synced');
        channelRef.current?.postMessage({
          type: 'synced_snapshot',
          userId: session.user.id,
          revision: nextRevision,
          snapshot,
        });
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [client, revision, session, snapshot, status, uploadedSnapshot]);

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
    setUploadedSnapshot(canonicalSnapshotDigest(remote.snapshot));
    window.localStorage.setItem(`my-emotion-map.cloud-revision.${session.user.id}`, String(remote.revision));
    applySnapshot(remote.snapshot);
    setRevision(remote.revision);
    setStatus('synced');
    channelRef.current?.postMessage({
      type: 'synced_snapshot',
      userId: session.user.id,
      revision: remote.revision,
      snapshot: remote.snapshot,
    });
  };

  const overwriteRemoteWithLocal = () => {
    const remote = conflictRemoteRef.current;
    if (!remote) return;
    setUploadedSnapshot(canonicalSnapshotDigest(remote.snapshot));
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
