import type {
  EmotionConversationEntity,
  EmotionFollowUpEntity,
  EmotionMessageEntity,
  EmotionMutation,
  EmotionMutationType,
  EmotionRecordEntity,
  EmotionRevisitEntity,
  EmotionWireMutation,
  NormalizedEmotionSnapshot,
} from './emotionSyncTypes';
import {
  isTerminalFollowUpStatus,
  validateEmotionMutation,
  validateEmotionMutations,
} from './emotionMutationValidation';

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, stableValue(child)]));
};

export const emotionValuesEqual = (left: unknown, right: unknown) =>
  JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));

const mutationId = () => globalThis.crypto?.randomUUID?.() ??
  `mutation-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createMutation = (
  type: EmotionMutationType,
  entityId: string,
  payload?: Record<string, unknown>,
  base?: Record<string, unknown> | null,
  parentId?: string,
): EmotionMutation => ({
  mutationId: mutationId(),
  type,
  entityId,
  parentId,
  payload,
  base,
  createdAt: Date.now(),
});

const asPayload = <T extends object>(value: T) =>
  structuredClone(value) as Record<string, unknown>;

export const emotionMutationKey = (mutation: EmotionMutation) => {
  if (mutation.type === 'settings_update') return 'settings';
  if (mutation.type === 'preferences_update') return 'preferences';
  const entity = mutation.type.split('_')[0];
  return entity === 'message'
    ? `message:${mutation.parentId ?? ''}:${mutation.entityId}`
    : `${entity}:${mutation.entityId}`;
};

type EntityWithId = { id: string };

const diffCollection = <T extends object>({
  base,
  next,
  id,
  parentId,
  upsert,
  softDelete,
}: {
  base: T[];
  next: T[];
  id: (value: T) => string;
  parentId?: (value: T) => string | undefined;
  upsert: EmotionMutationType;
  softDelete: EmotionMutationType;
}) => {
  const mutations: EmotionMutation[] = [];
  const baseById = new Map(base.map((entity) => [
    `${parentId?.(entity) ?? ''}/${id(entity)}`,
    entity,
  ]));
  const nextById = new Map(next.map((entity) => [
    `${parentId?.(entity) ?? ''}/${id(entity)}`,
    entity,
  ]));
  nextById.forEach((entity, key) => {
    const previous = baseById.get(key);
    if (!previous || !emotionValuesEqual(previous, entity)) {
      mutations.push(createMutation(
        upsert,
        id(entity),
        asPayload(entity),
        previous ? asPayload(previous) : null,
        parentId?.(entity),
      ));
    }
  });
  baseById.forEach((entity, key) => {
    if (!nextById.has(key)) {
      mutations.push(createMutation(
        softDelete,
        id(entity),
        undefined,
        asPayload(entity),
        parentId?.(entity),
      ));
    }
  });
  return mutations;
};

const CREATION_PRIORITY: Record<EmotionMutationType, number> = {
  settings_update: 0,
  preferences_update: 1,
  record_upsert: 2,
  conversation_upsert: 3,
  followup_upsert: 4,
  revisit_upsert: 5,
  message_upsert: 6,
  message_soft_delete: 7,
  revisit_soft_delete: 8,
  followup_soft_delete: 9,
  conversation_soft_delete: 10,
  record_soft_delete: 11,
};

const sortMutations = (mutations: EmotionMutation[]) => [...mutations].sort(
  (left, right) => CREATION_PRIORITY[left.type] - CREATION_PRIORITY[right.type] ||
    left.createdAt - right.createdAt ||
    emotionMutationKey(left).localeCompare(emotionMutationKey(right)),
);

export const diffEmotionState = (
  base: NormalizedEmotionSnapshot,
  next: NormalizedEmotionSnapshot,
) => {
  const mutations: EmotionMutation[] = [];
  if (!emotionValuesEqual(base.settings, next.settings)) {
    mutations.push(createMutation(
      'settings_update', 'settings', asPayload(next.settings),
      asPayload(base.settings),
    ));
  }
  if (!emotionValuesEqual(base.preferences, next.preferences)) {
    mutations.push(createMutation(
      'preferences_update', 'preferences', asPayload(next.preferences),
      asPayload(base.preferences),
    ));
  }
  mutations.push(
    ...diffCollection<EmotionRecordEntity>({
      base: base.records, next: next.records, id: (value) => value.momentId,
      upsert: 'record_upsert', softDelete: 'record_soft_delete',
    }),
    ...diffCollection<EmotionConversationEntity>({
      base: base.conversations, next: next.conversations, id: (value) => value.id,
      upsert: 'conversation_upsert', softDelete: 'conversation_soft_delete',
    }),
    ...diffCollection<EmotionFollowUpEntity>({
      base: base.followUps, next: next.followUps, id: (value) => value.id,
      upsert: 'followup_upsert', softDelete: 'followup_soft_delete',
    }),
    ...diffCollection<EmotionRevisitEntity>({
      base: base.revisits, next: next.revisits, id: (value) => value.id,
      upsert: 'revisit_upsert', softDelete: 'revisit_soft_delete',
    }),
    ...diffCollection<EmotionMessageEntity>({
      base: base.messages, next: next.messages, id: (value) => value.id,
      parentId: (value) => value.conversationId,
      upsert: 'message_upsert', softDelete: 'message_soft_delete',
    }),
  );
  validateEmotionMutations(mutations);
  return sortMutations(mutations);
};

export const compactEmotionMutations = (mutations: EmotionMutation[]) => {
  const compacted = new Map<string, EmotionMutation>();
  [...mutations]
    .map((mutation, index) => ({ mutation, index }))
    .sort((left, right) => left.mutation.createdAt - right.mutation.createdAt ||
      left.index - right.index)
    .forEach(({ mutation }) => {
      const key = emotionMutationKey(mutation);
      const previous = compacted.get(key);
      if (!previous) {
        compacted.set(key, mutation);
        return;
      }
      if (previous.type === 'followup_upsert' && mutation.type === 'followup_upsert' &&
        isTerminalFollowUpStatus(previous.payload?.status) &&
        !isTerminalFollowUpStatus(mutation.payload?.status)) {
        return;
      }
      if (mutation.type.endsWith('soft_delete') && previous.base === null) {
        compacted.delete(key);
        return;
      }
      compacted.set(key, {
        ...mutation,
        base: previous.base,
      });
    });
  return sortMutations([...compacted.values()].filter((mutation) =>
    mutation.type.endsWith('soft_delete') || mutation.base === undefined ||
    !emotionValuesEqual(mutation.payload ?? null, mutation.base),
  ));
};

const upsertEntity = <T extends object>(
  values: T[],
  next: T,
  key: (value: T) => string,
) => {
  const byId = new Map(values.map((value) => [key(value), value]));
  byId.set(key(next), next);
  return [...byId.values()];
};

const deleteEntity = <T extends object>(
  values: T[],
  id: string,
  key: (value: T) => string,
) => values.filter((value) => key(value) !== id);

export const applyEmotionMutationsToSnapshot = (
  source: NormalizedEmotionSnapshot,
  mutations: EmotionMutation[],
): NormalizedEmotionSnapshot => {
  const next = structuredClone(source);
  mutations.forEach((mutation) => {
    validateEmotionMutation(mutation);
    if (mutation.type === 'settings_update') {
      next.settings = structuredClone(mutation.payload) as typeof next.settings;
    } else if (mutation.type === 'preferences_update') {
      next.preferences = structuredClone(mutation.payload) as typeof next.preferences;
    } else if (mutation.type === 'record_upsert') {
      next.records = upsertEntity(
        next.records,
        structuredClone(mutation.payload) as EmotionRecordEntity,
        (value) => value.momentId,
      );
    } else if (mutation.type === 'record_soft_delete') {
      next.records = deleteEntity(next.records, mutation.entityId, (value) => value.momentId);
    } else if (mutation.type === 'conversation_upsert') {
      next.conversations = upsertEntity(
        next.conversations,
        structuredClone(mutation.payload) as EmotionConversationEntity,
        (value) => value.id,
      );
    } else if (mutation.type === 'conversation_soft_delete') {
      next.conversations = deleteEntity(next.conversations, mutation.entityId, (value) => value.id);
    } else if (mutation.type === 'message_upsert') {
      next.messages = upsertEntity(
        next.messages,
        structuredClone(mutation.payload) as EmotionMessageEntity,
        (value) => `${value.conversationId}/${value.id}`,
      );
    } else if (mutation.type === 'message_soft_delete') {
      next.messages = deleteEntity(
        next.messages,
        `${mutation.parentId ?? ''}/${mutation.entityId}`,
        (value) => `${value.conversationId}/${value.id}`,
      );
    } else if (mutation.type === 'followup_upsert') {
      next.followUps = upsertEntity(
        next.followUps,
        structuredClone(mutation.payload) as EmotionFollowUpEntity,
        (value) => value.id,
      );
    } else if (mutation.type === 'followup_soft_delete') {
      next.followUps = deleteEntity(next.followUps, mutation.entityId, (value) => value.id);
    } else if (mutation.type === 'revisit_upsert') {
      next.revisits = upsertEntity(
        next.revisits,
        structuredClone(mutation.payload) as EmotionRevisitEntity,
        (value) => value.id,
      );
    } else if (mutation.type === 'revisit_soft_delete') {
      next.revisits = deleteEntity(next.revisits, mutation.entityId, (value) => value.id);
    }
  });
  return next;
};

export const getEmotionMutationEntityValue = (
  snapshot: NormalizedEmotionSnapshot,
  mutation: EmotionMutation,
): Record<string, unknown> | null => {
  if (mutation.type === 'settings_update') return asPayload(snapshot.settings);
  if (mutation.type === 'preferences_update') return asPayload(snapshot.preferences);
  const collection: object[] = mutation.type.startsWith('record_')
    ? snapshot.records
    : mutation.type.startsWith('conversation_')
      ? snapshot.conversations
      : mutation.type.startsWith('message_')
        ? snapshot.messages
        : mutation.type.startsWith('followup_')
          ? snapshot.followUps
          : snapshot.revisits;
  const entity = collection.find((value) => {
    if (mutation.type.startsWith('record_')) {
      return (value as EmotionRecordEntity).momentId === mutation.entityId;
    }
    if (mutation.type.startsWith('message_')) {
      const message = value as EmotionMessageEntity;
      return message.id === mutation.entityId &&
        message.conversationId === mutation.parentId;
    }
    return (value as EntityWithId).id === mutation.entityId;
  });
  return entity ? asPayload(entity) : null;
};

export const toEmotionWireMutation = (
  mutation: EmotionMutation,
): EmotionWireMutation => ({
  type: mutation.type,
  entityId: mutation.entityId,
  ...(mutation.parentId ? { parentId: mutation.parentId } : {}),
  ...(mutation.payload ? { payload: structuredClone(mutation.payload) } : {}),
});
