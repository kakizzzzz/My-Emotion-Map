import type { AppLanguage } from '../i18n';
import { createGuidedAnswers } from '../domain/notePrompts';
import type { EmotionMoment, EmotionNote, EventTimeSource } from '../types';
import { createRecordId } from './createRecordId';

export type RecordSource = NonNullable<EmotionMoment['source']>;

export type CreateRecordInput = {
  longitude: number;
  latitude: number;
  place: string;
  language: AppLanguage;
  source: RecordSource;
  date?: string;
  time?: string;
  eventTimeSource?: EventTimeSource;
  photoTakenAt?: string;
  photoTakenAtKind?: EmotionMoment['photoTakenAtKind'];
  photoTakenAtSource?: EmotionMoment['photoTakenAtSource'];
  importedAt?: string;
  heartRate?: number;
  isInboxDraft?: boolean;
};

const localDateTime = (now = new Date()) => ({
  date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
});

export const createRecord = (input: CreateRecordInput): { moment: EmotionMoment; note: EmotionNote } => {
  const fallback = localDateTime();
  const date = input.date ?? fallback.date;
  const time = input.time ?? fallback.time;
  const momentId = createRecordId('moment');
  const noteId = createRecordId('note');
  const fallbackTitle = input.place ? `${input.place} · ${date}` : '';
  const moment: EmotionMoment = {
    id: momentId, noteId, emotion: null, intensity: 0, place: input.place,
    date, time, longitude: input.longitude, latitude: input.latitude,
    placeRating: null, isNew: true, source: input.source,
    eventTimeSource: input.eventTimeSource ?? 'device-created',
    photoTakenAt: input.photoTakenAt, photoTakenAtKind: input.photoTakenAtKind,
    photoTakenAtSource: input.photoTakenAtSource, importedAt: input.importedAt,
    heartRate: input.heartRate, isInboxDraft: input.isInboxDraft,
  };
  const note: EmotionNote = {
    id: noteId, title: fallbackTitle, titleSource: 'fallback', place: input.place,
    date, time, emotion: null, placeRating: null, excerpt: '',
    answers: createGuidedAnswers(input.language), isDraft: true,
    followUpEnabled: false,
  };
  return { moment, note };
};
