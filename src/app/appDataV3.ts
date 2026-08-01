import type { EmotionMoment, EmotionNote, StarInboxItem } from '../types';

const INBOX_STATUSES = new Set([
  'pending', 'draft_created', 'completed', 'dismissed',
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const asString = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.slice(0, maxLength) : '';
const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 &&
  !Number.isNaN(new Date(value).getTime());
const isCoordinate = (latitude: unknown, longitude: unknown) =>
  typeof latitude === 'number' && Number.isFinite(latitude) &&
  latitude >= -90 && latitude <= 90 &&
  typeof longitude === 'number' && Number.isFinite(longitude) &&
  longitude >= -180 && longitude <= 180;

export const sanitizeStarInboxItem = (
  value: unknown,
  issues: string[],
): StarInboxItem | null => {
  const source = asObject(value);
  const legacyEventAt =
    typeof source?.date === 'string' && ISO_DATE.test(source.date) &&
    typeof source.time === 'string' && CLOCK_TIME.test(source.time)
      ? `${source.date}T${source.time}:00`
      : '';
  const eventAt = isTimestamp(source?.eventAt) ? source.eventAt : legacyEventAt;
  const receivedAt = isTimestamp(source?.receivedAt) ? source.receivedAt : eventAt;
  const status = source?.status === 'saved' ? 'draft_created' : source?.status;
  if (
    !source || !asString(source.id, 200) || !eventAt ||
    typeof source.heartRate !== 'number' || !Number.isFinite(source.heartRate) ||
    source.heartRate < 20 || source.heartRate > 260 ||
    !INBOX_STATUSES.has(String(status)) || source.source !== 'heart-rate'
  ) {
    issues.push('inbox-item-dropped');
    return null;
  }
  const hasLocation = isCoordinate(source.latitude, source.longitude);
  return {
    id: asString(source.id, 200),
    source: 'heart-rate',
    sourceEventId: asString(source.sourceEventId, 180) || asString(source.id, 180),
    eventAt,
    receivedAt,
    heartRate: Math.round(source.heartRate),
    latitude: hasLocation ? source.latitude as number : undefined,
    longitude: hasLocation ? source.longitude as number : undefined,
    locationCapturedAt: isTimestamp(source.locationCapturedAt)
      ? source.locationCapturedAt : undefined,
    locationAccuracyMeters:
      typeof source.locationAccuracyMeters === 'number' &&
      Number.isFinite(source.locationAccuracyMeters) && source.locationAccuracyMeters >= 0
        ? source.locationAccuracyMeters : undefined,
    linkedMomentId: asString(source.linkedMomentId, 200) || undefined,
    status: status as StarInboxItem['status'],
    seenAt: isTimestamp(source.seenAt) ? source.seenAt : undefined,
    confirmedAt: isTimestamp(source.confirmedAt) ? source.confirmedAt : undefined,
  };
};

export const migrateLegacyHiddenDefaults = (
  sourceVersion: number,
  moments: EmotionMoment[],
  notes: EmotionNote[],
  issues: string[],
) => {
  const noteById = new Map(notes.map((note) => [note.id, note]));
  if (sourceVersion < 3) {
    for (const moment of moments) {
      const note = noteById.get(moment.noteId);
      const hiddenDraft = moment.isNew === true || moment.isInboxDraft === true || note?.isDraft === true;
      if (hiddenDraft && (moment.emotion === 'tender' || moment.emotion === 'mixed')) {
        moment.emotion = null;
        moment.intensity = 0;
        issues.push('legacy-hidden-emotion-cleared');
      }
      if (hiddenDraft && moment.placeRating === 'neutral') {
        moment.placeRating = null;
        issues.push('legacy-hidden-place-rating-cleared');
      }
      moment.eventTimeSource ??= 'legacy';
      if (note) {
        note.emotion = moment.emotion;
        note.placeRating = moment.placeRating;
      }
    }
  }
  return noteById;
};

export const relinkLegacyInboxDrafts = (
  items: StarInboxItem[],
  moments: EmotionMoment[],
  noteById: Map<string, EmotionNote>,
) => {
  for (const item of items) {
    if (item.status !== 'draft_created' || item.linkedMomentId) continue;
    const moment = moments.find((candidate) => candidate.id === `health-star-${item.id}`);
    if (!moment) continue;
    item.linkedMomentId = moment.id;
    item.status = noteById.get(moment.noteId)?.isDraft === false
      ? 'completed' : 'draft_created';
  }
};

export const DEMO_INBOX_ITEMS: StarInboxItem[] = [
  {
    id: 'inbox-library', sourceEventId: 'demo-library',
    eventAt: '2026-08-01T18:42:00+09:00', receivedAt: '2026-08-01T18:43:00+09:00',
    heartRate: 126, latitude: 37.5591, longitude: 127.0008,
    status: 'pending', source: 'heart-rate',
  },
  {
    id: 'inbox-cafeteria', sourceEventId: 'demo-cafeteria',
    eventAt: '2026-08-01T14:16:00+09:00', receivedAt: '2026-08-01T14:17:00+09:00',
    heartRate: 121, latitude: 37.5587, longitude: 127.0012,
    status: 'pending', source: 'heart-rate',
  },
  {
    id: 'inbox-studio', sourceEventId: 'demo-studio',
    eventAt: '2026-07-31T21:08:00+09:00', receivedAt: '2026-07-31T21:09:00+09:00',
    heartRate: 52, latitude: 37.5582, longitude: 126.9994,
    status: 'pending', source: 'heart-rate',
  },
];
