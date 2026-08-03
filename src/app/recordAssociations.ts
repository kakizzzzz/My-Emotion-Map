import type {
  AppDataSnapshot,
  EmotionKey,
  EmotionNote,
  RevisitRecord,
} from '../types';
import { createRecordId } from './createRecordId';

export const appendRevisitRecord = (
  revisits: RevisitRecord[],
  note: EmotionNote,
  emotion: EmotionKey,
  sourceFollowUpId?: string,
  revisitedAt = new Date().toISOString(),
): RevisitRecord[] => setRevisitCurrentEmotion(
  revisits,
  note,
  sourceFollowUpId ?? `manual:${createRecordId('revisit-source')}`,
  emotion,
  'different',
  revisitedAt,
);

export const upsertFollowUpRevisit = (
  revisits: RevisitRecord[],
  note: EmotionNote,
  sourceFollowUpId: string,
  changeDirection: RevisitRecord['changeDirection'],
  revisitedAt = new Date().toISOString(),
): RevisitRecord[] => {
  const existing = revisits.find(
    (record) => record.sourceFollowUpId === sourceFollowUpId,
  );
  if (existing) {
    return revisits.map((record) =>
      record.id === existing.id
        ? { ...record, changeDirection, revisitedAt }
        : record,
    );
  }
  return [
    ...revisits,
    {
      id: createRecordId('revisit'),
      noteId: note.id,
      originalEmotion: note.emotion,
      changeDirection,
      originalOccurredAt: note.occurredAtUtc ??
        new Date(`${note.localDate || note.date}T${note.localTime || note.time}:00`)
          .toISOString(),
      revisitedAt,
      sourceFollowUpId,
    },
  ];
};

export const setRevisitCurrentEmotion = (
  revisits: RevisitRecord[],
  note: EmotionNote,
  sourceFollowUpId: string,
  currentEmotion: EmotionKey,
  changeDirection: RevisitRecord['changeDirection'],
  revisitedAt = new Date().toISOString(),
): RevisitRecord[] => upsertFollowUpRevisit(
  revisits,
  note,
  sourceFollowUpId,
  changeDirection,
  revisitedAt,
).map((record) =>
  record.sourceFollowUpId === sourceFollowUpId
    ? { ...record, currentEmotion }
    : record,
);

export const removeMomentAssociations = (
  snapshot: AppDataSnapshot,
  momentId: string,
): AppDataSnapshot => {
  const moment = snapshot.moments.find((item) => item.id === momentId);
  if (!moment) return snapshot;
  const removedFollowUpIds = new Set(
    snapshot.followUps
      .filter((record) => record.noteId === moment.noteId)
      .map((record) => record.id),
  );
  return {
    ...snapshot,
    moments: snapshot.moments
      .filter((item) => item.id !== momentId)
      .map((item) =>
        moment.tagGroupId !== undefined && moment.tagOrder !== undefined &&
        item.tagGroupId === moment.tagGroupId && item.tagOrder !== undefined &&
        item.tagOrder > moment.tagOrder
          ? { ...item, tagOrder: item.tagOrder - 1 }
          : item,
      ),
    notes: snapshot.notes.filter((note) => note.id !== moment.noteId),
    followUps: snapshot.followUps.filter((record) => record.noteId !== moment.noteId),
    revisits: snapshot.revisits.filter((record) => record.noteId !== moment.noteId),
    conversations: snapshot.conversations.map((conversation) => ({
      ...conversation,
      messages: conversation.messages
        .filter((message) =>
          !message.followUpId || !removedFollowUpIds.has(message.followUpId),
        )
        .map((message) => ({
          ...message,
          noteIds: message.noteIds?.filter((noteId) => noteId !== moment.noteId),
        }))
        .filter((message) =>
          message.body.trim().length > 0 || Boolean(message.noteIds?.length) ||
          Boolean(message.followUpId),
        ),
    })),
  };
};
