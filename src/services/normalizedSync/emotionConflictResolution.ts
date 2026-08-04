import {
  clearEmotionMutationOutbox,
  discardEmotionOutboxAfterRecovery,
  writeEmotionRecoveryBundle,
  type EmotionMutationOutbox,
} from './emotionOutbox';
import { replaceEmotionOutboxMutations } from './emotionOutboxCommit';
import {
  keepLocalEmotionConflicts,
  preserveEmotionMutationConflicts,
} from './emotionConflicts';
import { applyEmotionMutationsToSnapshot } from './emotionMutationModel';
import { createEmotionRecoveryBundle } from './emotionSyncRuntime';
import type { NormalizedEmotionSnapshot } from './emotionSyncTypes';

export type EmotionConflictResolutionMode = 'safe' | 'local' | 'remote';

export const resolveEmotionSyncConflict = async ({
  mode,
  userId,
  remote,
  local,
  outbox,
  revision,
  language,
}: {
  mode: EmotionConflictResolutionMode;
  userId: string;
  remote: NormalizedEmotionSnapshot;
  local: NormalizedEmotionSnapshot;
  outbox: EmotionMutationOutbox;
  revision: number;
  language: string;
}) => {
  const safe = mode === 'safe'
    ? preserveEmotionMutationConflicts({
        pendingMutations: outbox.mutations,
        remote,
        language,
      })
    : null;
  const recovery = createEmotionRecoveryBundle({
    userId,
    kind: mode === 'remote' ? 'load-cloud' : mode === 'local'
      ? 'keep-local' : 'conflict',
    localSnapshot: local,
    remoteSnapshot: remote,
    outbox,
    revision,
    conflicts: safe?.recovery,
  });
  if (mode === 'remote') {
    await discardEmotionOutboxAfterRecovery(recovery);
    return { recovery, outbox: null, display: remote };
  }
  await writeEmotionRecoveryBundle(recovery);
  const mutations = safe?.mutations ?? keepLocalEmotionConflicts({
    pendingMutations: outbox.mutations,
    remote,
  });
  if (!mutations.length) {
    await clearEmotionMutationOutbox(userId);
    return { recovery, outbox: null, display: remote };
  }
  const nextOutbox = await replaceEmotionOutboxMutations({
    outbox,
    expectedRevision: revision,
    mutations,
  });
  return {
    recovery,
    outbox: nextOutbox,
    display: applyEmotionMutationsToSnapshot(remote, nextOutbox.mutations),
  };
};
