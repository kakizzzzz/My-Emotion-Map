import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNT_PREFERENCES_CHANGED_EVENT, loadLocalSettings } from '../../app/profilePreferences';
import { normalizeEmotionSnapshot } from '../../domain/storage/normalizedEmotionSnapshot';
import type { AppDataSnapshot } from '../../types';
import { clearEmotionMutationOutbox, enqueueEmotionMutations,
  newestEmotionOutboxForUser, readEmotionMutationOutbox,
  writeEmotionRecoveryBundle,
  type EmotionMutationOutbox,
  type EmotionRecoveryBundle, type EmotionSyncErrorInfo,
} from './emotionOutbox';
import { acknowledgeEmotionInFlightBatch, persistEmotionInFlightBatch,
  replaceEmotionOutboxMutations } from './emotionOutboxCommit';
import { reconcileEmotionMutationsAfterRemoteAdvance } from './emotionConflicts';
import { resolveEmotionSyncConflict,
  type EmotionConflictResolutionMode,
} from './emotionConflictResolution';
import { applyEmotionMutationsToSnapshot, diffEmotionState } from './emotionMutationModel';
import { applyEmotionChanges, applyEmotionMutations,
  loadEmotionChangesSince, loadNormalizedEmotionAccountData,
} from './emotionRepository';
import { emotionSyncErrorInfo, normalizeEmotionSyncError } from './emotionSyncErrors';
import { bootstrapNormalizedEmotionSync } from './emotionSyncBootstrap';
import { createEmotionRecoveryBundle, downloadEmotionRecoveryBundle,
  normalizedEmotionDeviceSnapshot, persistNormalizedEmotionPreferences,
} from './emotionSyncRuntime';
import type {
  CloudSyncStatus,
  EmotionMutation,
  NormalizedEmotionSnapshot,
} from './emotionSyncTypes';
import { nextEmotionMutationBatch } from './emotionMutationBatching';
export type { CloudSyncStatus } from './emotionSyncTypes';
const online = () => typeof navigator === 'undefined' || navigator.onLine;
export function useNormalizedCloudSync({
  client,
  session,
  snapshot,
  applySnapshot,
  blockedByFutureSchema = false,
  pauseRemoteRefresh = false,
}: {
  client: SupabaseClient | null;
  session: Session | null;
  snapshot: AppDataSnapshot;
  applySnapshot: (snapshot: AppDataSnapshot) => void;
  blockedByFutureSchema?: boolean;
  pauseUploads?: boolean;
  pauseRemoteRefresh?: boolean;
}) {
  const [status, setStatus] = useState<CloudSyncStatus>(
    client ? 'signed_out' : 'unconfigured',
  );
  const [revision, setRevision] = useState<number | null>(null);
  const [outboxVersion, setOutboxVersion] = useState(0);
  const [errorInfo, setErrorInfo] = useState<EmotionSyncErrorInfo | null>(null);
  const [isUserOperationSync, setIsUserOperationSync] = useState(false);
  const generationRef = useRef(0);
  const activeUserRef = useRef('');
  const snapshotRef = useRef(snapshot);
  const applySnapshotRef = useRef(applySnapshot);
  const remoteRef = useRef<NormalizedEmotionSnapshot | null>(null);
  const observedLocalRef = useRef<NormalizedEmotionSnapshot | null>(null);
  const revisionRef = useRef<number | null>(null);
  const outboxRef = useRef<EmotionMutationOutbox | null>(null);
  const conflictRemoteRef = useRef<NormalizedEmotionSnapshot | null>(null);
  const recoveryRef = useRef<EmotionRecoveryBundle | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const readyRef = useRef(false);
  const flushingRef = useRef(false);
  const refreshingRef = useRef(false);
  const deferredRefreshRef = useRef(false);
  const suppressPreferenceEventRef = useRef(false);
  const pendingLocalEnqueueCountRef = useRef(0);
  const localQueueRef = useRef(Promise.resolve());
  useLayoutEffect(() => {
    snapshotRef.current = snapshot;
    applySnapshotRef.current = applySnapshot;
  }, [applySnapshot, snapshot]);
  const setRemoteRevision = useCallback((next: number | null) => {
    revisionRef.current = next;
    setRevision(next);
  }, []);
  const applyNormalizedToDevice = useCallback((
    userId: string,
    normalized: NormalizedEmotionSnapshot,
  ) => {
    observedLocalRef.current = structuredClone(normalized);
    suppressPreferenceEventRef.current = true;
    persistNormalizedEmotionPreferences(userId, normalized);
    suppressPreferenceEventRef.current = false;
    applySnapshotRef.current(normalizedEmotionDeviceSnapshot(
      normalized,
      snapshotRef.current,
    ));
  }, []);
  const handleError = useCallback((value: unknown) => {
    const error = normalizeEmotionSyncError(value);
    setErrorInfo(emotionSyncErrorInfo(error));
    if (error.kind === 'setup_required') setStatus('setup_required');
    else if (error.kind === 'upgrade_required') setStatus('upgrade_required');
    else if (error.kind === 'network' || !online()) setStatus('offline');
    else setStatus('error');
  }, []);
  const hasUnqueuedLocalChanges = useCallback((userId: string) => {
    if (pendingLocalEnqueueCountRef.current > 0) return true;
    if (outboxRef.current?.mutations.length) return false;
    if (!observedLocalRef.current) {
      return false;
    }
    const local = normalizeEmotionSnapshot(
      snapshotRef.current,
      loadLocalSettings(userId),
    ).snapshot;
    return diffEmotionState(observedLocalRef.current, local).length > 0;
  }, []);
  const saveConflict = useCallback(async (
    userId: string,
    remote: NormalizedEmotionSnapshot,
    nextRevision: number,
    outbox: EmotionMutationOutbox,
    conflicts: unknown[],
  ) => {
    conflictRemoteRef.current = remote;
    const local = observedLocalRef.current ?? applyEmotionMutationsToSnapshot(
      remote,
      outbox.mutations,
    );
    const recovery = createEmotionRecoveryBundle({
      userId, kind: 'conflict', localSnapshot: local,
      remoteSnapshot: remote, outbox, revision: nextRevision, conflicts,
    });
    recoveryRef.current = recovery;
    try { await writeEmotionRecoveryBundle(recovery); } catch { /* retained in memory */ }
    setRemoteRevision(nextRevision);
    setStatus('conflict');
  }, [setRemoteRevision]);

  const acceptRemoteAdvance = useCallback(async (
    userId: string,
    remote: NormalizedEmotionSnapshot,
    nextRevision: number,
    confirmedMutations: EmotionMutation[] = [],
  ) => {
    remoteRef.current = remote;
    setRemoteRevision(nextRevision);
    const outbox = outboxRef.current;
    if (!outbox?.mutations.length) {
      if (outbox) await clearEmotionMutationOutbox(userId);
      outboxRef.current = null;
      applyNormalizedToDevice(userId, remote);
      setErrorInfo(null);
      setStatus('synced');
      return true;
    }
    const reconciled = reconcileEmotionMutationsAfterRemoteAdvance({
      pendingMutations: outbox.mutations,
      confirmedMutations,
      inFlightMutations: outbox.inFlightBatch?.mutations ?? [],
      remote,
    });
    if (reconciled.conflicts.length) {
      await saveConflict(userId, remote, nextRevision, outbox, reconciled.conflicts);
      return false;
    }
    if (!reconciled.safeMutations.length) {
      await clearEmotionMutationOutbox(userId);
      outboxRef.current = null;
      applyNormalizedToDevice(userId, remote);
      setErrorInfo(null);
      setStatus('synced');
      return true;
    }
    const nextOutbox = await replaceEmotionOutboxMutations({
      outbox,
      expectedRevision: nextRevision,
      mutations: reconciled.safeMutations,
    });
    outboxRef.current = nextOutbox;
    applyNormalizedToDevice(userId, applyEmotionMutationsToSnapshot(
      remote,
      nextOutbox.mutations,
    ));
    setStatus('local');
    setOutboxVersion((value) => value + 1);
    return true;
  }, [applyNormalizedToDevice, saveConflict, setRemoteRevision]);

  const refreshRemote = useCallback(async () => {
    const userId = session?.user.id;
    if (!client || !userId || !readyRef.current || refreshingRef.current ||
      status === 'conflict' || status === 'upgrade_required' ||
      status === 'setup_required') return;
    if (pauseRemoteRefresh) {
      deferredRefreshRef.current = true;
      return;
    }
    if (hasUnqueuedLocalChanges(userId)) {
      deferredRefreshRef.current = true;
      return;
    }
    refreshingRef.current = true;
    const requestGeneration = generationRef.current;
    if (!outboxRef.current?.mutations.length) {
      setIsUserOperationSync(false);
      setStatus('checking');
    }
    try {
      const currentRemote = remoteRef.current;
      const currentRevision = revisionRef.current;
      const loaded = currentRemote && currentRevision !== null
        ? await loadEmotionChangesSince(client, userId, currentRevision)
        : await loadNormalizedEmotionAccountData(client, userId);
      if (generationRef.current !== requestGeneration ||
        activeUserRef.current !== userId) return;
      const remote = 'records' in loaded
        ? applyEmotionChanges(currentRemote as NormalizedEmotionSnapshot, loaded)
        : loaded.snapshot;
      if (hasUnqueuedLocalChanges(userId)) {
        deferredRefreshRef.current = true;
        return;
      }
      await acceptRemoteAdvance(userId, remote, loaded.revision);
    } catch (error) {
      if (generationRef.current === requestGeneration) handleError(error);
    } finally {
      refreshingRef.current = false;
      deferredRefreshRef.current = false;
    }
  }, [acceptRemoteAdvance, client, handleError, hasUnqueuedLocalChanges,
    pauseRemoteRefresh, session?.user.id, status]);

  const flushOutbox = useCallback(async () => {
    const userId = session?.user.id;
    if (!client || !userId || flushingRef.current || !online() ||
      status === 'conflict' || status === 'upgrade_required' ||
      status === 'setup_required') return;
    flushingRef.current = true;
    const requestGeneration = generationRef.current;
    let completedNormally = false;
    try {
      while (outboxRef.current?.mutations.length) {
        let outbox = outboxRef.current;
        const batch = nextEmotionMutationBatch(outbox);
        if (!outbox.inFlightBatch) {
          outbox = await persistEmotionInFlightBatch(outbox, batch);
          outboxRef.current = outbox;
        }
        setStatus('syncing');
        const result = await applyEmotionMutations(
          client,
          outbox.inFlightBatch?.expectedRevision ?? outbox.expectedRevision,
          batch,
        );
        if (generationRef.current !== requestGeneration ||
          activeUserRef.current !== userId) return;
        if (!result.saved) {
          await refreshRemote();
          return;
        }
        outboxRef.current = await acknowledgeEmotionInFlightBatch(
          outbox,
          result.revision,
        );
        const previousRevision = revisionRef.current ?? outbox.expectedRevision;
        const changes = await loadEmotionChangesSince(
          client,
          userId,
          previousRevision,
        );
        const remote = applyEmotionChanges(
          remoteRef.current as NormalizedEmotionSnapshot,
          changes,
        );
        if (hasUnqueuedLocalChanges(userId)) {
          if (pendingLocalEnqueueCountRef.current > 0) {
            await localQueueRef.current;
            await acceptRemoteAdvance(userId, remote, changes.revision, batch);
          } else {
            remoteRef.current = remote;
            setRemoteRevision(changes.revision);
            deferredRefreshRef.current = true;
          }
          continue;
        }
        await acceptRemoteAdvance(userId, remote, changes.revision, batch);
        channelRef.current?.postMessage({
          type: 'normalized_revision', userId, revision: changes.revision,
        });
        if (conflictRemoteRef.current) return;
      }
      await localQueueRef.current;
      outboxRef.current = newestEmotionOutboxForUser(
        outboxRef.current,
        await readEmotionMutationOutbox(userId),
        userId,
      );
      completedNormally = true;
    } catch (error) {
      handleError(error);
    } finally {
      flushingRef.current = false;
      if (completedNormally && outboxRef.current?.mutations.length &&
        !conflictRemoteRef.current) {
        setStatus('local');
        setOutboxVersion((value) => value + 1);
      }
    }
  }, [acceptRemoteAdvance, client, handleError, hasUnqueuedLocalChanges,
    refreshRemote, session?.user.id, setRemoteRevision, status]);

  const enqueueCurrentLocal = useCallback(() => {
    const userId = session?.user.id;
    if (!userId || !readyRef.current || !remoteRef.current) return;
    const local = normalizeEmotionSnapshot(
      snapshotRef.current,
      loadLocalSettings(userId),
    ).snapshot;
    const previous = observedLocalRef.current ?? remoteRef.current;
    const mutations = diffEmotionState(previous, local);
    observedLocalRef.current = local;
    if (!mutations.length) return;
    setIsUserOperationSync(true);
    pendingLocalEnqueueCountRef.current += 1;
    localQueueRef.current = localQueueRef.current.then(async () => {
      try {
        const next = await enqueueEmotionMutations({
          userId,
          expectedRevision: revisionRef.current ?? 0,
          mutations,
          language: loadLocalSettings(userId).language,
        });
        outboxRef.current = next;
        setErrorInfo(null);
        setStatus('local');
        setOutboxVersion((value) => value + 1);
      } finally {
        pendingLocalEnqueueCountRef.current = Math.max(
          0,
          pendingLocalEnqueueCountRef.current - 1,
        );
      }
    }).catch(handleError);
  }, [handleError, session?.user.id]);

  useEffect(() => { enqueueCurrentLocal(); }, [enqueueCurrentLocal, snapshot]);
  useEffect(() => {
    const listener = (event: Event) => {
      if (suppressPreferenceEventRef.current) return;
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId === session?.user.id) enqueueCurrentLocal();
    };
    window.addEventListener(ACCOUNT_PREFERENCES_CHANGED_EVENT, listener);
    return () => window.removeEventListener(ACCOUNT_PREFERENCES_CHANGED_EVENT, listener);
  }, [enqueueCurrentLocal, session?.user.id]);

  useEffect(() => {
    if (!outboxVersion || status !== 'local') return;
    const timer = window.setTimeout(() => { void flushOutbox(); }, 350);
    return () => window.clearTimeout(timer);
  }, [flushOutbox, outboxVersion, status]);

  useEffect(() => {
    channelRef.current?.close();
    const userId = session?.user.id;
    if (!client || !userId || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(`my-emotion-map-sync:${userId}`);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data as { type?: unknown; userId?: unknown; revision?: unknown };
      if (message?.type !== 'normalized_revision' || message.userId !== userId ||
        !Number.isSafeInteger(Number(message.revision)) ||
        Number(message.revision) <= (revisionRef.current ?? -1)) return;
      void refreshRemote();
    };
    return () => channel.close();
  }, [client, refreshRemote, session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!client || !userId || blockedByFutureSchema) return;
    const recheck = () => {
      if (document.visibilityState === 'hidden') return;
      void refreshRemote();
      void flushOutbox();
    };
    window.addEventListener('focus', recheck);
    window.addEventListener('pageshow', recheck);
    window.addEventListener('online', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      window.removeEventListener('pageshow', recheck);
      window.removeEventListener('online', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [blockedByFutureSchema, client, flushOutbox, refreshRemote, session?.user.id]);

  useEffect(() => {
    if (pauseRemoteRefresh || !deferredRefreshRef.current) return;
    void refreshRemote();
  }, [pauseRemoteRefresh, refreshRemote]);

  useEffect(() => {
    generationRef.current += 1;
    const requestGeneration = generationRef.current;
    readyRef.current = false;
    remoteRef.current = null;
    observedLocalRef.current = null;
    outboxRef.current = null;
    conflictRemoteRef.current = null;
    recoveryRef.current = null;
    setIsUserOperationSync(false);
    setErrorInfo(null);
    if (!client) {
      activeUserRef.current = '';
      setRemoteRevision(null);
      setStatus('unconfigured');
      return;
    }
    const userId = session?.user.id;
    if (!userId) {
      activeUserRef.current = '';
      setRemoteRevision(null);
      setStatus('signed_out');
      return;
    }
    activeUserRef.current = userId;
    if (blockedByFutureSchema) {
      setRemoteRevision(null);
      setStatus('upgrade_required');
      return;
    }
    setStatus('checking');
    void (async () => {
      try {
        const bootstrapped = await bootstrapNormalizedEmotionSync({
          client,
          userId,
          snapshot: snapshotRef.current,
        });
        if (generationRef.current !== requestGeneration ||
          activeUserRef.current !== userId) return;
        const { loaded, local, decision } = bootstrapped;
        remoteRef.current = loaded.snapshot;
        setRemoteRevision(loaded.revision);
        const latestLocal = normalizeEmotionSnapshot(
          snapshotRef.current,
          loadLocalSettings(userId),
        ).snapshot;
        const changesDuringBootstrap = diffEmotionState(local, latestLocal);
        let outbox = bootstrapped.outbox;
        if (changesDuringBootstrap.length) {
          setIsUserOperationSync(true);
          outbox = await enqueueEmotionMutations({
            userId,
            expectedRevision: outbox?.expectedRevision ?? loaded.revision,
            mutations: changesDuringBootstrap,
            language: loadLocalSettings(userId).language,
          });
        }
        observedLocalRef.current = changesDuringBootstrap.length
          ? latestLocal
          : local;
        outboxRef.current = outbox;
        readyRef.current = true;
        if (outbox?.mutations.length) {
          await acceptRemoteAdvance(userId, loaded.snapshot, loaded.revision);
          return;
        }
        if (decision === 'conflict' && outbox) {
          await saveConflict(userId, loaded.snapshot, loaded.revision, outbox, []);
        } else if (decision === 'enqueue_local' && outbox?.mutations.length) {
          setStatus('local');
          setOutboxVersion((value) => value + 1);
        } else {
          applyNormalizedToDevice(userId, loaded.snapshot);
          setStatus('synced');
        }
      } catch (error) {
        if (generationRef.current === requestGeneration) handleError(error);
      }
    })();
  }, [acceptRemoteAdvance, applyNormalizedToDevice, blockedByFutureSchema,
    client, handleError, saveConflict, session?.user.id, setRemoteRevision]);

  const resolveConflict = useCallback(async (
    mode: EmotionConflictResolutionMode,
  ) => {
    const userId = session?.user.id;
    const remote = conflictRemoteRef.current;
    const outbox = outboxRef.current;
    const nextRevision = revisionRef.current;
    if (!userId || !remote || !outbox || nextRevision === null) return;
    setIsUserOperationSync(true);
    const local = observedLocalRef.current ?? applyEmotionMutationsToSnapshot(
      remote,
      outbox.mutations,
    );
    try {
      const resolved = await resolveEmotionSyncConflict({
        mode, userId, remote, local, outbox, revision: nextRevision,
        language: loadLocalSettings(userId).language,
      });
      recoveryRef.current = resolved.recovery;
      outboxRef.current = resolved.outbox;
      conflictRemoteRef.current = null;
      applyNormalizedToDevice(userId, resolved.display);
      if (resolved.outbox) {
        setStatus('local');
        setOutboxVersion((value) => value + 1);
      } else {
        setStatus('synced');
      }
    } catch (error) {
      setErrorInfo({
        kind: 'storage', message: error instanceof Error ? error.message : 'Recovery failed.',
      });
      setStatus('conflict');
    }
  }, [applyNormalizedToDevice, session?.user.id]);
  return {
    status,
    isUserOperationSync,
    errorInfo,
    datasetRevision: revision ?? 0,
    // Keep chat usable after a successful bootstrap even while local changes
    // are queued or a retryable sync error is visible. Record-aware answers
    // remain bounded to this last server-confirmed revision.
    revision,
    safeMerge: () => { void resolveConflict('safe'); },
    useRemoteVersion: () => { void resolveConflict('remote'); },
    overwriteRemoteWithLocal: () => { void resolveConflict('local'); },
    downloadRecovery: () => {
      if (recoveryRef.current) downloadEmotionRecoveryBundle(recoveryRef.current);
    },
  };
}
