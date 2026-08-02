import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppLanguage } from '../i18n';
import type {
  Conversation,
  EmotionKey,
  EmotionMoment,
  EmotionNote,
  FollowUpRecord,
  StarInboxItem,
} from '../types';
import type { PhotoAssistDelivery, ToastHandler } from './appTypes';
import { createFollowUpForNote } from '../domain/followUps';

export const useNoteEditorHandlers = ({
  client,
  language,
  starSavedMessage,
  moments,
  starInboxItems,
  followUps,
  setMoments,
  setNotes,
  setStarInboxItems,
  setFollowUps,
  setConversations,
  setEditingMomentId,
  setPhotoAssistByMomentId,
  showToast,
}: {
  client: SupabaseClient | null;
  language: AppLanguage;
  starSavedMessage: string;
  moments: EmotionMoment[];
  starInboxItems: StarInboxItem[];
  followUps: FollowUpRecord[];
  setMoments: Dispatch<SetStateAction<EmotionMoment[]>>;
  setNotes: Dispatch<SetStateAction<EmotionNote[]>>;
  setStarInboxItems: Dispatch<SetStateAction<StarInboxItem[]>>;
  setFollowUps: Dispatch<SetStateAction<FollowUpRecord[]>>;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setEditingMomentId: Dispatch<SetStateAction<string | null>>;
  setPhotoAssistByMomentId: Dispatch<
    SetStateAction<Record<string, PhotoAssistDelivery>>
  >;
  showToast: ToastHandler;
}) => {
  const clearPhotoAssist = (momentId: string) => {
    setPhotoAssistByMomentId((current) => {
      if (!(momentId in current)) return current;
      const next = { ...current };
      delete next[momentId];
      return next;
    });
  };
  const closeNoteEditor = (momentId: string) => {
    setEditingMomentId(null);
    clearPhotoAssist(momentId);
  };
  const saveNoteDraft = (
    momentId: string,
    nextNote: EmotionNote,
    emotion: EmotionKey | null,
    placeRating: EmotionMoment['placeRating'],
    color?: string,
    place?: string,
  ) => {
    setNotes((current) => current.map((item) => item.id === nextNote.id
      ? { ...nextNote, isDraft: true }
      : item));
    setMoments((current) => current.map((item) => item.id === momentId
      ? { ...item, emotion, placeRating, place: place ?? item.place, color, isNew: true }
      : item));
    closeNoteEditor(momentId);
  };
  const deleteNoteDraft = (momentId: string) => {
    const noteId = moments.find((item) => item.id === momentId)?.noteId;
    setMoments((current) => current.filter((item) => item.id !== momentId));
    if (noteId) setNotes((current) => current.filter((item) => item.id !== noteId));
    setStarInboxItems((current) => current.map((item) =>
      item.linkedMomentId === momentId && item.status === 'draft_created'
        ? { ...item, linkedMomentId: undefined, confirmedAt: undefined, status: 'pending' }
        : item));
    closeNoteEditor(momentId);
  };
  const saveNote = (
    momentId: string,
    nextNote: EmotionNote,
    emotion: EmotionKey | null,
    placeRating: EmotionMoment['placeRating'],
    color?: string,
    place?: string,
  ) => {
    const completedExternalEventIds = starInboxItems
      .filter((item) => item.linkedMomentId === momentId)
      .map((item) => item.sourceEventId);
    const pendingFollowUpIds = new Set(followUps
      .filter((record) => record.noteId === nextNote.id &&
        (record.status === 'queued' || record.status === 'active'))
      .map((record) => record.id));
    setNotes((current) => current.some((note) => note.id === nextNote.id)
      ? current.map((note) => note.id === nextNote.id ? nextNote : note)
      : [...current, nextNote]);
    setMoments((current) => current.map((moment) => moment.id === momentId
      ? {
          ...moment,
          emotion,
          placeRating,
          place: place ?? moment.place,
          color,
          isNew: false,
          isInboxDraft: false,
        }
      : moment));
    setStarInboxItems((current) => current.map((item) =>
      item.linkedMomentId === momentId && item.status === 'draft_created'
        ? { ...item, status: 'completed' }
        : item));
    if (client && completedExternalEventIds.length) {
      void client.from('shortcut_observations')
        .update({ status: 'consumed' })
        .in('event_id', completedExternalEventIds);
    }
    setFollowUps((current) => {
      const pending = current.some((record) => record.noteId === nextNote.id &&
        (record.status === 'queued' || record.status === 'active'));
      if (!nextNote.followUpEnabled) {
        return current.filter((record) => record.noteId !== nextNote.id ||
          (record.status !== 'queued' && record.status !== 'active'));
      }
      return pending ? current : [...current, createFollowUpForNote(nextNote, language)];
    });
    if (!nextNote.followUpEnabled && pendingFollowUpIds.size) {
      setConversations((current) => current.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.filter((message) =>
          !message.followUpId || !pendingFollowUpIds.has(message.followUpId)),
      })));
    }
    closeNoteEditor(momentId);
    showToast(starSavedMessage);
  };
  return { closeNoteEditor, saveNoteDraft, deleteNoteDraft, saveNote };
};
