import type { Dispatch, SetStateAction } from 'react';
import type { AppLanguage } from '../i18n';
import type {
  Conversation,
  EmotionKey,
  EmotionMoment,
  EmotionNote,
  FollowUpRecord,
} from '../types';
import type { PhotoAssistDelivery, ToastHandler } from './appTypes';
import {
  createFollowUpForNote,
  normalizeFollowUpCurve,
} from '../domain/followUps';

export const useNoteEditorHandlers = ({
  language,
  starSavedMessage,
  followUps,
  followUpIntervals,
  setMoments,
  setNotes,
  setFollowUps,
  setConversations,
  setEditingMomentId,
  setPhotoAssistByMomentId,
  showToast,
}: {
  language: AppLanguage;
  starSavedMessage: string;
  followUps: FollowUpRecord[];
  followUpIntervals: number[];
  setMoments: Dispatch<SetStateAction<EmotionMoment[]>>;
  setNotes: Dispatch<SetStateAction<EmotionNote[]>>;
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
  const saveNote = (
    momentId: string,
    nextNote: EmotionNote,
    emotion: EmotionKey | null,
    placeRating: EmotionMoment['placeRating'],
    color?: string,
    place?: string,
  ) => {
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
        }
      : moment));
    setFollowUps((current) => {
      if (!nextNote.followUpEnabled) {
        return current.filter((record) => record.noteId !== nextNote.id ||
          (record.status !== 'queued' && record.status !== 'active'));
      }
      const curve = normalizeFollowUpCurve(followUpIntervals);
      const desired = new Set(curve);
      const pending = current.filter((record) => record.noteId === nextNote.id &&
        (record.status === 'queued' || record.status === 'active'));
      const existingIntervals = new Set(
        pending.map((record) => record.intervalDays),
      );
      const consentedAt = pending[0]?.followUpConsentedAt
        ? new Date(pending[0].followUpConsentedAt)
        : new Date();
      const retained = current.filter((record) =>
        record.noteId !== nextNote.id ||
        (record.status !== 'queued' && record.status !== 'active') ||
        desired.has(record.intervalDays),
      );
      const additions = curve
        .filter((interval) => !existingIntervals.has(interval))
        .map((interval) => createFollowUpForNote(
          nextNote,
          language,
          interval,
          consentedAt,
        ));
      return [...retained, ...additions];
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
  return { closeNoteEditor, saveNote };
};
