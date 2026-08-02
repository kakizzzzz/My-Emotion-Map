import type {
  AppDataSnapshot,
  EmotionKey,
  EmotionNote,
  RevisitRecord,
  StarInboxItem,
} from '../types';
import { createRecordId } from './createRecordId';

export const appendRevisitRecord = (
  revisits: RevisitRecord[],
  note: EmotionNote,
  emotion: EmotionKey,
  sourceFollowUpId?: string,
  revisitedAt = new Date().toISOString(),
): RevisitRecord[] => [
  ...revisits,
  {
    id: createRecordId('revisit'),
    noteId: note.id,
    originalEmotion: note.emotion,
    revisitedEmotion: emotion,
    originalOccurredAt: new Date(`${note.date}T${note.time}:00`).toISOString(),
    revisitedAt,
    sourceFollowUpId,
  },
];

export const dismissInboxItem = (
  items: StarInboxItem[],
  itemId: string,
  seenAt = new Date().toISOString(),
): StarInboxItem[] => items.map((item) =>
  item.id === itemId
    ? { ...item, status: 'dismissed', seenAt: item.seenAt ?? seenAt }
    : item,
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
    starInboxItems: snapshot.starInboxItems.map((item) =>
      item.linkedMomentId === moment.id
        ? {
            ...item,
            linkedMomentId: undefined,
            status: 'pending',
            confirmedAt: undefined,
          }
        : item,
    ),
  };
};
