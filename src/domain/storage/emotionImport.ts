import { stableSerialize } from '../../app/workspace/workspaceStorage';
import { assembleNormalizedEmotionSnapshot } from './normalizedEmotionSnapshot';
import type { AppDataSnapshot } from '../../types';
import type { NormalizedEmotionSnapshot } from '../../services/normalizedSync/emotionSyncTypes';

export type EmotionImportMode = 'merge' | 'replace';

export type EmotionImportConflict = {
  entity: 'settings' | 'preferences' | 'record' | 'conversation' | 'message' | 'followup' | 'revisit';
  id: string;
};

const equal = (left: unknown, right: unknown) =>
  stableSerialize(left) === stableSerialize(right);

const mergeCollection = <T>({
  current,
  incoming,
  key,
  entity,
  conflicts,
}: {
  current: T[];
  incoming: T[];
  key: (value: T) => string;
  entity: EmotionImportConflict['entity'];
  conflicts: EmotionImportConflict[];
}) => {
  const merged = current.map((value) => structuredClone(value));
  const currentById = new Map(current.map((value) => [key(value), value]));
  incoming.forEach((value) => {
    const id = key(value);
    const existing = currentById.get(id);
    if (!existing) {
      merged.push(structuredClone(value));
    } else if (!equal(existing, value)) {
      conflicts.push({ entity, id });
    }
  });
  return merged;
};

export const mergeEmotionImport = ({
  current,
  incoming,
}: {
  current: NormalizedEmotionSnapshot;
  incoming: NormalizedEmotionSnapshot;
}) => {
  const conflicts: EmotionImportConflict[] = [];
  if (!equal(current.settings, incoming.settings)) {
    conflicts.push({ entity: 'settings', id: 'settings' });
  }
  if (!equal(current.preferences, incoming.preferences)) {
    conflicts.push({ entity: 'preferences', id: 'preferences' });
  }
  return {
    conflicts,
    snapshot: {
      settings: structuredClone(current.settings),
      preferences: structuredClone(current.preferences),
      records: mergeCollection({
        current: current.records,
        incoming: incoming.records,
        key: (value) => value.momentId,
        entity: 'record',
        conflicts,
      }),
      conversations: mergeCollection({
        current: current.conversations,
        incoming: incoming.conversations,
        key: (value) => value.id,
        entity: 'conversation',
        conflicts,
      }),
      messages: mergeCollection({
        current: current.messages,
        incoming: incoming.messages,
        key: (value) => `${value.conversationId}/${value.id}`,
        entity: 'message',
        conflicts,
      }),
      followUps: mergeCollection({
        current: current.followUps,
        incoming: incoming.followUps,
        key: (value) => value.id,
        entity: 'followup',
        conflicts,
      }),
      revisits: mergeCollection({
        current: current.revisits,
        incoming: incoming.revisits,
        key: (value) => value.id,
        entity: 'revisit',
        conflicts,
      }),
    } satisfies NormalizedEmotionSnapshot,
  };
};

export const prepareEmotionImport = ({
  current,
  incoming,
  mode,
  device,
}: {
  current: NormalizedEmotionSnapshot;
  incoming: NormalizedEmotionSnapshot;
  mode: EmotionImportMode;
  device: AppDataSnapshot;
}) => {
  const result = mode === 'merge'
    ? mergeEmotionImport({ current, incoming })
    : { snapshot: structuredClone(incoming), conflicts: [] };
  return {
    ...result,
    appSnapshot: assembleNormalizedEmotionSnapshot(result.snapshot, {
      lastViewport: device.lastViewport,
      lastConversationId: device.lastConversationId,
    }),
  };
};
