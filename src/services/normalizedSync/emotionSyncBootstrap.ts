import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalSnapshotDigest } from '../../app/appDataRepository';
import { loadLocalSettings } from '../../app/profilePreferences';
import { normalizeEmotionSnapshot } from '../../domain/storage/normalizedEmotionSnapshot';
import type { AppDataSnapshot } from '../../types';
import { loadSyncMeta } from '../cloudSyncModel';
import {
  convertLegacySyncToOutbox,
  readEmotionMutationOutbox,
  writeEmotionRecoveryBundle,
  type LegacySyncConversionDecision,
} from './emotionOutbox';
import { loadNormalizedEmotionAccountData } from './emotionRepository';
import {
  hasNormalizedEmotionContent,
  createEmotionRecoveryBundle,
  normalizedEmotionDigest,
} from './emotionSyncRuntime';

export const bootstrapNormalizedEmotionSync = async ({
  client,
  userId,
  snapshot,
}: {
  client: SupabaseClient;
  userId: string;
  snapshot: AppDataSnapshot;
}) => {
  const loaded = await loadNormalizedEmotionAccountData(client, userId);
  const settings = loadLocalSettings(userId);
  const localResult = normalizeEmotionSnapshot(snapshot, settings);
  let outbox = await readEmotionMutationOutbox(userId);
  if (localResult.recovery.length) {
    await writeEmotionRecoveryBundle(createEmotionRecoveryBundle({
      userId,
      kind: 'conflict',
      localSnapshot: localResult.snapshot,
      remoteSnapshot: loaded.snapshot,
      outbox,
      revision: loaded.revision,
      conflicts: localResult.recovery,
    }));
  }
  if (outbox?.mutations.length) {
    return {
      loaded,
      local: localResult.snapshot,
      localRecovery: localResult.recovery,
      outbox,
      decision: null as LegacySyncConversionDecision | null,
    };
  }
  const localNormalizedHash = normalizedEmotionDigest(localResult.snapshot);
  const remoteHash = normalizedEmotionDigest(loaded.snapshot);
  const decision = await convertLegacySyncToOutbox({
    userId,
    remote: loaded.snapshot,
    local: localResult.snapshot,
    remoteRevision: loaded.revision,
    localHash: localNormalizedHash === remoteHash
      ? localNormalizedHash
      : canonicalSnapshotDigest(snapshot),
    remoteHash,
    meta: loadSyncMeta(userId),
    remoteIsEmpty: !hasNormalizedEmotionContent(loaded.snapshot),
    localHasValidRecords: hasNormalizedEmotionContent(localResult.snapshot),
    legacyArchiveExists:
      typeof loaded.migrationVerification?.archiveRevision === 'number',
    language: settings.language,
  });
  outbox = await readEmotionMutationOutbox(userId);
  return {
    loaded,
    local: localResult.snapshot,
    localRecovery: localResult.recovery,
    outbox,
    decision,
  };
};
