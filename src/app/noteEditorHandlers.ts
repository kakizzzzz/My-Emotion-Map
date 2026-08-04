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

const DAY_MS = 86_400_000;
const isPendingFollowUp = (record: FollowUpRecord) =>
  record.status === 'queued' || record.status === 'active';

const consentCycleKey = (record: FollowUpRecord) => {
  const explicit = record.followUpConsentedAt;
  if (explicit && Number.isFinite(new Date(explicit).getTime())) {
    return explicit;
  }
  const dueTime = new Date(record.dueAt).getTime();
  return Number.isFinite(dueTime)
    ? new Date(dueTime - record.intervalDays * DAY_MS).toISOString()
    : '';
};

export const reconcileFollowUpsForNote = ({
  records,
  note,
  language,
  intervals,
  enabled,
  wasEnabled,
  now = new Date(),
}: {
  records: FollowUpRecord[];
  note: EmotionNote;
  language: AppLanguage;
  intervals: number[];
  enabled: boolean;
  wasEnabled: boolean;
  now?: Date;
}) => {
  if (!enabled) {
    return records.filter(
      (record) => record.noteId !== note.id || !isPendingFollowUp(record),
    );
  }

  const curve = normalizeFollowUpCurve(intervals);
  const desiredIntervals = new Set(curve);
  const noteRecords = records.filter((record) => record.noteId === note.id);
  const latestExistingCycle = noteRecords
    .map((record) => consentCycleKey(record))
    .filter(Boolean)
    .sort(
      (left, right) =>
        new Date(right).getTime() - new Date(left).getTime(),
    )[0];
  const cycleKey = wasEnabled && latestExistingCycle
    ? latestExistingCycle
    : now.toISOString();
  const cycleDate = new Date(cycleKey);
  const existingIntervals = new Set(
    noteRecords
      .filter((record) => consentCycleKey(record) === cycleKey)
      .map((record) => record.intervalDays),
  );
  const keptPendingIntervals = new Set<number>();
  const retained = records.filter((record) => {
    if (record.noteId !== note.id) return true;
    if (!isPendingFollowUp(record)) return true;
    if (consentCycleKey(record) !== cycleKey) return false;
    if (!desiredIntervals.has(record.intervalDays)) return false;
    if (keptPendingIntervals.has(record.intervalDays)) return false;
    keptPendingIntervals.add(record.intervalDays);
    return true;
  });
  const additions = curve
    .filter((days) => !existingIntervals.has(days))
    .map((days) =>
      createFollowUpForNote(note, language, days, cycleDate),
    );
  return [...retained, ...additions];
};

export const useNoteEditorHandlers = ({
  language,
  starSavedMessage,
  notes,
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
  notes: EmotionNote[];
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
    const previousNote = notes.find((note) => note.id === nextNote.id);
    const wasFollowUpEnabled =
      previousNote?.followUpEnabled === true ||
      followUps.some(
        (record) => record.noteId === nextNote.id && isPendingFollowUp(record),
      );
    const pendingFollowUpIds = new Set(
      followUps
        .filter(
          (record) =>
            record.noteId === nextNote.id && isPendingFollowUp(record),
        )
        .map((record) => record.id),
    );
    setNotes((current) =>
      current.some((note) => note.id === nextNote.id)
        ? current.map((note) => (note.id === nextNote.id ? nextNote : note))
        : [...current, nextNote],
    );
    setMoments((current) =>
      current.map((moment) =>
        moment.id === momentId
          ? {
              ...moment,
              emotion,
              placeRating,
              place: place ?? moment.place,
              color,
              isNew: false,
            }
          : moment,
      ),
    );
    setFollowUps((current) => reconcileFollowUpsForNote({
      records: current,
      note: nextNote,
      language,
      intervals: followUpIntervals,
      enabled: nextNote.followUpEnabled === true,
      wasEnabled: wasFollowUpEnabled,
    }));
    if (!nextNote.followUpEnabled && pendingFollowUpIds.size) {
      setConversations((current) =>
        current.map((conversation) => {
          const messages = conversation.messages.filter(
            (message) =>
              !message.followUpId ||
              !pendingFollowUpIds.has(message.followUpId),
          );
          if (messages.length === conversation.messages.length) {
            return conversation;
          }
          return {
            ...conversation,
            messages,
            preview: messages[messages.length - 1]?.body ?? '',
            unread: messages.length ? conversation.unread : false,
          };
        }),
      );
    }
    closeNoteEditor(momentId);
    showToast(starSavedMessage);
  };
  return { closeNoteEditor, saveNote };
};
