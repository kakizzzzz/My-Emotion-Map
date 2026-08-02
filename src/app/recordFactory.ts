import type { AppLanguage } from '../i18n';
import { createGuidedAnswers } from '../domain/notePrompts';
import type { EmotionMoment, EmotionNote, EventTimeSource } from '../types';
import { createRecordId } from './createRecordId';
import { createTemporalFields } from '../domain/time/temporal';

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
  locationCapturedAt?: string;
  locationTimeRelation?: EmotionMoment['locationTimeRelation'];
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
  const temporal = createTemporalFields({
    localDate: date,
    localTime: time,
    source: input.eventTimeSource ?? 'device-created',
    sourceTimestamp: input.photoTakenAt,
  });
  const moment: EmotionMoment = {
    id: momentId, noteId, emotion: null, intensity: 0, place: input.place,
    date, time, longitude: input.longitude, latitude: input.latitude,
    placeRating: null, isNew: true, source: input.source,
    ...temporal,
    photoTakenAt: input.photoTakenAt, photoTakenAtKind: input.photoTakenAtKind,
    photoTakenAtSource: input.photoTakenAtSource, importedAt: input.importedAt,
    heartRate: input.heartRate, isInboxDraft: input.isInboxDraft,
    locationCapturedAt: input.locationCapturedAt,
    locationTimeRelation: input.locationTimeRelation,
  };
  const note: EmotionNote = {
    id: noteId, title: fallbackTitle, titleSource: 'fallback', place: input.place,
    date, time, emotion: null, placeRating: null, excerpt: '',
    answers: createGuidedAnswers(input.language), isDraft: true,
    followUpEnabled: false,
    ...temporal,
  };
  return { moment, note };
};
