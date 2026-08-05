import {
  loadLocalSettings,
  saveLocalSettings,
} from '../../app/profilePreferences';
import { canonicalSnapshotDigest } from '../../app/appDataRepository';
import { assembleNormalizedEmotionSnapshot } from '../../domain/storage/normalizedEmotionSnapshot';
import type { AppDataSnapshot } from '../../types';
import type {
  EmotionMutationOutbox,
  EmotionRecoveryBundle,
} from './emotionOutbox';
import type { NormalizedEmotionSnapshot } from './emotionSyncTypes';

export const normalizedEmotionDigest = (
  snapshot: NormalizedEmotionSnapshot,
) => canonicalSnapshotDigest(assembleNormalizedEmotionSnapshot(snapshot));

export const hasNormalizedEmotionContent = (
  snapshot: NormalizedEmotionSnapshot,
) => snapshot.records.length > 0 || snapshot.conversations.length > 0 ||
  snapshot.messages.length > 0 || snapshot.followUps.length > 0 ||
  snapshot.revisits.length > 0;

export const normalizedEmotionDeviceSnapshot = (
  normalized: NormalizedEmotionSnapshot,
  device: AppDataSnapshot,
) => assembleNormalizedEmotionSnapshot(normalized, {
  lastViewport: device.lastViewport,
  lastConversationId: device.lastConversationId,
});

export const persistNormalizedEmotionPreferences = (
  userId: string,
  snapshot: NormalizedEmotionSnapshot,
) => {
  const local = loadLocalSettings(userId);
  return saveLocalSettings({
    ...local,
    ...snapshot.preferences,
    profileId: local.profileId,
  }, userId);
};

export const createEmotionRecoveryBundle = ({
  userId,
  kind,
  localSnapshot,
  remoteSnapshot,
  outbox,
  revision,
  conflicts,
}: {
  userId: string;
  kind: EmotionRecoveryBundle['kind'];
  localSnapshot: NormalizedEmotionSnapshot;
  remoteSnapshot: NormalizedEmotionSnapshot;
  outbox: EmotionMutationOutbox | null;
  revision: number;
  conflicts?: unknown[];
}): EmotionRecoveryBundle => {
  const exportedAt = new Date().toISOString();
  const suffix = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id: `emotion-recovery-${userId}-${suffix}`,
    userId,
    kind,
    localSnapshot: structuredClone(localSnapshot),
    remoteSnapshot: structuredClone(remoteSnapshot),
    outbox: outbox ? structuredClone(outbox) : null,
    revision,
    exportedAt,
    ...(conflicts ? { conflicts: structuredClone(conflicts) } : {}),
  };
};

export const downloadEmotionRecoveryBundle = (
  recovery: EmotionRecoveryBundle,
) => {
  const blob = new Blob([JSON.stringify(recovery, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `my-emotion-map-recovery-${recovery.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
};
