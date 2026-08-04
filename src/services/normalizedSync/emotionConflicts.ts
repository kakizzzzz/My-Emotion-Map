import {
  applyEmotionMutationsToSnapshot,
  compactEmotionMutations,
  diffEmotionState,
  emotionMutationKey,
  emotionValuesEqual,
  getEmotionMutationEntityValue,
} from './emotionMutationModel';
import { isTerminalFollowUpStatus } from './emotionMutationValidation';
import type {
  EmotionMutation,
  NormalizedEmotionSnapshot,
} from './emotionSyncTypes';

export type EmotionMutationConflict = {
  key: string;
  mutation: EmotionMutation;
  remoteValue: Record<string, unknown> | null;
  reason:
    | 'same-entity-changed'
    | 'delete-versus-edit'
    | 'unique-reference-conflict';
};

export type EmotionConflictRecovery = {
  key: string;
  reason:
    | 'local-delete-preserved-remotely'
    | 'same-record-copied'
    | 'same-message-copied'
    | 'terminal-followup-conflict'
    | 'revisit-uniqueness-conflict'
    | 'field-conflict'
    | 'remote-canonical';
  localMutation: EmotionMutation;
  remoteValue: Record<string, unknown> | null;
  field?: string;
};

const mutationMatchesRemote = (
  mutation: EmotionMutation,
  remote: NormalizedEmotionSnapshot,
) => {
  const remoteValue = getEmotionMutationEntityValue(remote, mutation);
  return mutation.type.endsWith('soft_delete')
    ? remoteValue === null
    : emotionValuesEqual(mutation.payload ?? null, remoteValue);
};

const uniqueRemoteValue = (
  mutation: EmotionMutation,
  remote: NormalizedEmotionSnapshot,
) => {
  const payload = mutation.payload;
  if (!payload) return null;
  if (mutation.type === 'record_upsert' && payload.noteId) {
    return remote.records.find((record) =>
      record.noteId === payload.noteId && record.momentId !== mutation.entityId,
    ) ?? null;
  }
  if (mutation.type === 'conversation_upsert' && payload.kind === 'companion') {
    return remote.conversations.find((conversation) =>
      conversation.kind === 'companion' && conversation.id !== mutation.entityId,
    ) ?? null;
  }
  if (mutation.type === 'message_upsert') {
    return remote.messages.find((message) =>
      (payload.requestId && message.requestId === payload.requestId &&
        message.id !== mutation.entityId) ||
      (payload.replyToRequestId &&
        message.replyToRequestId === payload.replyToRequestId &&
        message.role === 'assistant' && message.id !== mutation.entityId),
    ) ?? null;
  }
  if (mutation.type === 'followup_upsert' && payload.answerCommandId) {
    return remote.followUps.find((followUp) =>
      followUp.answerCommandId === payload.answerCommandId &&
        followUp.id !== mutation.entityId,
    ) ?? null;
  }
  if (mutation.type === 'revisit_upsert' && payload.sourceFollowUpId) {
    return remote.revisits.find((revisit) =>
      revisit.sourceFollowUpId === payload.sourceFollowUpId &&
        revisit.id !== mutation.entityId,
    ) ?? null;
  }
  return null;
};

export const rebaseEmotionMutationBases = (
  mutations: EmotionMutation[],
  remote: NormalizedEmotionSnapshot,
) => mutations.map((mutation) => ({
  ...mutation,
  base: getEmotionMutationEntityValue(remote, mutation),
}));

export const reconcileEmotionMutationsAfterRemoteAdvance = ({
  pendingMutations,
  inFlightMutations,
  remote,
}: {
  pendingMutations: EmotionMutation[];
  inFlightMutations: EmotionMutation[];
  remote: NormalizedEmotionSnapshot;
}) => {
  const appliedKeys = new Set(inFlightMutations
    .filter((mutation) => mutationMatchesRemote(mutation, remote))
    .map(emotionMutationKey));
  const safeMutations: EmotionMutation[] = [];
  const conflicts: EmotionMutationConflict[] = [];
  const appliedMutationIds: string[] = [];

  pendingMutations.forEach((mutation) => {
    const key = emotionMutationKey(mutation);
    const directRemoteValue = getEmotionMutationEntityValue(remote, mutation);
    const uniqueConflictValue = directRemoteValue === null
      ? uniqueRemoteValue(mutation, remote)
      : null;
    const remoteValue = directRemoteValue ?? (
      uniqueConflictValue ? { ...uniqueConflictValue } : null
    );
    if (mutationMatchesRemote(mutation, remote)) {
      appliedMutationIds.push(mutation.mutationId);
      return;
    }
    if (emotionValuesEqual(mutation.base ?? null, remoteValue) ||
      appliedKeys.has(key)) {
      safeMutations.push({ ...mutation, base: remoteValue });
      return;
    }
    conflicts.push({
      key,
      mutation,
      remoteValue,
      reason: uniqueConflictValue
        ? 'unique-reference-conflict'
        : mutation.type.endsWith('soft_delete')
          ? 'delete-versus-edit'
          : 'same-entity-changed',
    });
  });

  return {
    safeMutations: compactEmotionMutations(safeMutations),
    conflicts,
    appliedMutationIds,
  };
};

const conflictSuffix = (mutation: EmotionMutation) =>
  mutation.mutationId.replace(/[^a-z0-9]/gi, '').slice(-10) || 'localcopy';

const conflictId = (mutation: EmotionMutation, sourceId = mutation.entityId) => {
  const suffix = `-conflict-${conflictSuffix(mutation)}`;
  return `${sourceId.slice(0, Math.max(1, 200 - suffix.length))}${suffix}`;
};

const copyMutation = (
  mutation: EmotionMutation,
  entityId: string,
  payload: Record<string, unknown>,
  parentId = mutation.parentId,
): EmotionMutation => ({
  ...mutation,
  mutationId: globalThis.crypto?.randomUUID?.() ??
    `conflict-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  entityId,
  parentId,
  payload,
  base: null,
  createdAt: Date.now(),
});

const mergeAccountFields = (
  conflict: EmotionMutationConflict,
  recovery: EmotionConflictRecovery[],
) => {
  const base = conflict.mutation.base ?? {};
  const local = conflict.mutation.payload ?? {};
  const remote = conflict.remoteValue ?? {};
  const merged = { ...remote };
  Object.keys(local).forEach((field) => {
    const baseValue = base[field];
    const localValue = local[field];
    const remoteValue = remote[field];
    if (emotionValuesEqual(remoteValue, baseValue)) {
      merged[field] = localValue;
    } else if (!emotionValuesEqual(localValue, baseValue) &&
      !emotionValuesEqual(localValue, remoteValue)) {
      recovery.push({
        key: conflict.key,
        reason: 'field-conflict',
        localMutation: conflict.mutation,
        remoteValue: conflict.remoteValue,
        field,
      });
    }
  });
  return emotionValuesEqual(merged, remote)
    ? []
    : [{ ...conflict.mutation, payload: merged, base: remote }];
};

const normalizeActiveFollowUps = (snapshot: NormalizedEmotionSnapshot) => {
  const active = snapshot.followUps
    .filter((followUp) => followUp.status === 'active')
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt) ||
      left.id.localeCompare(right.id));
  if (active.length <= 1) return snapshot;
  const keepId = active[0].id;
  return {
    ...snapshot,
    followUps: snapshot.followUps.map((followUp) =>
      followUp.status === 'active' && followUp.id !== keepId
        ? { ...followUp, status: 'queued' as const, promptedAt: undefined }
        : followUp),
  };
};

export const preserveEmotionMutationConflicts = ({
  pendingMutations,
  remote,
  language = 'en',
}: {
  pendingMutations: EmotionMutation[];
  remote: NormalizedEmotionSnapshot;
  language?: string;
}) => {
  const classified = reconcileEmotionMutationsAfterRemoteAdvance({
    pendingMutations,
    inFlightMutations: [],
    remote,
  });
  const recovery: EmotionConflictRecovery[] = [];
  const merged = [...classified.safeMutations];
  const label = language === 'zh'
    ? '（本机冲突副本）'
    : language === 'ko'
      ? ' (기기 충돌 사본)'
      : ' (local conflict copy)';

  classified.conflicts.forEach((conflict) => {
    const mutation = conflict.mutation;
    if (mutation.type.endsWith('soft_delete')) {
      recovery.push({
        key: conflict.key,
        reason: 'local-delete-preserved-remotely',
        localMutation: mutation,
        remoteValue: conflict.remoteValue,
      });
      return;
    }
    if (mutation.type === 'record_upsert' && mutation.payload) {
      const nextMomentId = conflictId(mutation);
      const nextNoteId = conflictId(mutation, String(mutation.payload.noteId ?? 'note'));
      const title = String(mutation.payload.title ?? '');
      merged.push(copyMutation(mutation, nextMomentId, {
        ...mutation.payload,
        momentId: nextMomentId,
        noteId: nextNoteId,
        title: title.length + label.length <= 500 ? `${title}${label}` : title,
      }));
      recovery.push({
        key: conflict.key,
        reason: 'same-record-copied',
        localMutation: mutation,
        remoteValue: conflict.remoteValue,
      });
      return;
    }
    if (mutation.type === 'message_upsert' && mutation.payload &&
      conflict.reason !== 'unique-reference-conflict') {
      const nextId = conflictId(mutation);
      merged.push(copyMutation(mutation, nextId, {
        ...mutation.payload,
        id: nextId,
        deliveryState: 'stopped',
      }));
      recovery.push({
        key: conflict.key,
        reason: 'same-message-copied',
        localMutation: mutation,
        remoteValue: conflict.remoteValue,
      });
      return;
    }
    if (mutation.type === 'followup_upsert' && mutation.payload) {
      const localTerminal = isTerminalFollowUpStatus(mutation.payload.status);
      const remoteTerminal = isTerminalFollowUpStatus(conflict.remoteValue?.status);
      if (localTerminal && !remoteTerminal) {
        merged.push({ ...mutation, base: conflict.remoteValue });
      } else if (localTerminal && remoteTerminal &&
        !emotionValuesEqual(mutation.payload, conflict.remoteValue)) {
        recovery.push({
          key: conflict.key,
          reason: 'terminal-followup-conflict',
          localMutation: mutation,
          remoteValue: conflict.remoteValue,
        });
      }
      return;
    }
    if (mutation.type === 'revisit_upsert') {
      recovery.push({
        key: conflict.key,
        reason: 'revisit-uniqueness-conflict',
        localMutation: mutation,
        remoteValue: conflict.remoteValue,
      });
      return;
    }
    if (mutation.type === 'settings_update' ||
      mutation.type === 'preferences_update') {
      merged.push(...mergeAccountFields(conflict, recovery));
      return;
    }
    recovery.push({
      key: conflict.key,
      reason: 'remote-canonical',
      localMutation: mutation,
      remoteValue: conflict.remoteValue,
    });
  });

  const compacted = compactEmotionMutations(merged);
  const preview = applyEmotionMutationsToSnapshot(remote, compacted);
  const normalized = normalizeActiveFollowUps(preview);
  const activeSlotFixes = diffEmotionState(preview, normalized);
  return {
    mutations: compactEmotionMutations([...compacted, ...activeSlotFixes]),
    recovery,
    appliedMutationIds: classified.appliedMutationIds,
  };
};

export const keepLocalEmotionConflicts = ({
  pendingMutations,
  remote,
}: {
  pendingMutations: EmotionMutation[];
  remote: NormalizedEmotionSnapshot;
}) => {
  const unapplied = pendingMutations.filter(
    (mutation) => !mutationMatchesRemote(mutation, remote),
  );
  return compactEmotionMutations(rebaseEmotionMutationBases(unapplied, remote));
};
