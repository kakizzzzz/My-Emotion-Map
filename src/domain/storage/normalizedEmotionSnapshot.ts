import {
  MAX_AI_CONTEXT_MESSAGE_COUNT,
  normalizeAvatarSrc,
  MIN_AI_CONTEXT_MESSAGE_COUNT,
  normalizeAiContextMessageCount,
} from '../../app/profilePreferences';
import { normalizeFollowUpCurve } from '../followUps';
import type {
  AppDataSnapshot,
  EmotionMoment,
  EmotionNote,
  LocalSettings,
  MapViewport,
} from '../../types';
import type {
  EmotionPreferencesEntity,
  EmotionRecordEntity,
  EmotionRecordRecovery,
  NormalizedEmotionBuildResult,
  NormalizedEmotionSnapshot,
} from '../../services/normalizedSync/emotionSyncTypes';

const sharedMomentFields = (moment: EmotionMoment) => ({
  place: moment.place,
  emotion: moment.emotion,
  placeRating: moment.placeRating,
  color: moment.color ?? null,
  localDate: moment.localDate ?? moment.date,
  localTime: moment.localTime ?? moment.time,
  occurredAtUtc: moment.occurredAtUtc ?? null,
  timeZone: moment.timeZone ?? null,
  utcOffsetMinutes: moment.utcOffsetMinutes ?? null,
  timePrecision: moment.timePrecision ?? 'minute',
  eventTimeSource: moment.eventTimeSource ?? 'legacy',
});

const sharedNoteFields = (note: EmotionNote) => ({
  place: note.place,
  emotion: note.emotion,
  placeRating: note.placeRating,
  color: note.color ?? null,
  localDate: note.localDate ?? note.date,
  localTime: note.localTime ?? note.time,
  occurredAtUtc: note.occurredAtUtc ?? null,
  timeZone: note.timeZone ?? null,
  utcOffsetMinutes: note.utcOffsetMinutes ?? null,
  timePrecision: note.timePrecision ?? 'minute',
  eventTimeSource: note.eventTimeSource ?? 'legacy',
});

export const recordSharedFieldsDiverged = (
  moment: EmotionMoment,
  note: EmotionNote,
) => JSON.stringify(sharedMomentFields(moment)) !==
  JSON.stringify(sharedNoteFields(note));

const fallbackNoteForMoment = (moment: EmotionMoment): EmotionNote => ({
  id: moment.noteId,
  title: '',
  titleSource: 'fallback',
  place: moment.place,
  date: moment.localDate ?? moment.date,
  time: moment.localTime ?? moment.time,
  emotion: moment.emotion,
  color: moment.color,
  placeRating: moment.placeRating,
  answers: [],
  excerpt: '',
  isDraft: true,
  followUpEnabled: false,
  occurredAtUtc: moment.occurredAtUtc ?? null,
  localDate: moment.localDate ?? moment.date,
  localTime: moment.localTime ?? moment.time,
  timeZone: moment.timeZone ?? null,
  utcOffsetMinutes: moment.utcOffsetMinutes ?? null,
  timePrecision: moment.timePrecision ?? 'minute',
  eventTimeSource: moment.eventTimeSource ?? 'legacy',
});

const canonicalRecord = (
  moment: EmotionMoment,
  note: EmotionNote,
  sortOrder: number,
  recovery: EmotionRecordRecovery[],
  issues: string[],
): EmotionRecordEntity => {
  const diverged = recordSharedFieldsDiverged(moment, note);
  const useFormalNote = diverged && moment.isNew === true && note.isDraft !== true;
  const shared = useFormalNote ? sharedNoteFields(note) : sharedMomentFields(moment);
  if (diverged) {
    issues.push('record-shared-fields-diverged');
    recovery.push({
      reason: 'record-shared-fields-diverged',
      momentId: moment.id,
      noteId: note.id,
      moment: structuredClone(moment),
      note: structuredClone(note),
      canonicalSource: useFormalNote ? 'note' : 'moment',
    });
  }
  return {
    momentId: moment.id,
    noteId: note.id,
    sortOrder,
    longitude: moment.longitude,
    latitude: moment.latitude,
    ...shared,
    intensity: shared.emotion === null ? 0 : moment.intensity,
    tagGroupId: moment.tagGroupId ?? null,
    tagOrder: moment.tagOrder ?? null,
    source: moment.source ?? null,
    photoTakenAt: moment.photoTakenAt ?? null,
    photoTakenAtKind: moment.photoTakenAtKind ?? null,
    photoTakenAtSource: moment.photoTakenAtSource ?? null,
    importedAt: moment.importedAt ?? null,
    locationCapturedAt: moment.locationCapturedAt ?? null,
    locationTimeRelation: moment.locationTimeRelation ?? null,
    title: note.title,
    titleSource: note.titleSource ?? null,
    answers: structuredClone(note.answers),
    excerpt: note.excerpt,
    isDraft: note.isDraft === true,
    isNew: moment.isNew === true,
    followUpEnabled: note.followUpEnabled === true,
    image: note.image ? structuredClone(note.image) : null,
  };
};

export const normalizeEmotionPreferences = (
  settings: LocalSettings,
): EmotionPreferencesEntity => ({
  avatarSrc: normalizeAvatarSrc(settings.avatarSrc),
  profileName: settings.profileName.trim().slice(0, 80),
  language: settings.language,
  aboutMe: settings.aboutMe.slice(0, 2_000),
  aiUserPrompt: settings.aiUserPrompt.trim().slice(0, 500),
  aiContextMessageCount: normalizeAiContextMessageCount(
    settings.aiContextMessageCount,
  ),
  chatPreferenceTags: [...new Set(settings.chatPreferenceTags
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean))]
    .slice(0, 20),
  followUpIntervals: normalizeFollowUpCurve(settings.followUpIntervals),
});

export const normalizeEmotionSnapshot = (
  source: AppDataSnapshot,
  localSettings: LocalSettings,
): NormalizedEmotionBuildResult => {
  const issues: string[] = [];
  const recovery: EmotionRecordRecovery[] = [];
  const momentIds = new Set<string>();
  const noteOwners = new Set<string>();
  const noteById = new Map<string, EmotionNote>();
  source.notes.forEach((note) => {
    if (noteById.has(note.id)) {
      issues.push('duplicate-note-id');
      recovery.push({ reason: 'duplicate-note-id', noteId: note.id, note });
    } else {
      noteById.set(note.id, note);
    }
  });

  const records = source.moments.flatMap((moment, sortOrder) => {
    if (momentIds.has(moment.id)) {
      issues.push('duplicate-moment-id');
      recovery.push({
        reason: 'duplicate-moment-id',
        momentId: moment.id,
        noteId: moment.noteId,
        moment,
      });
      return [];
    }
    momentIds.add(moment.id);
    if (noteOwners.has(moment.noteId)) {
      issues.push('duplicate-note-id');
      recovery.push({
        reason: 'duplicate-note-id',
        momentId: moment.id,
        noteId: moment.noteId,
        moment,
        note: noteById.get(moment.noteId),
      });
      return [];
    }
    noteOwners.add(moment.noteId);
    const existingNote = noteById.get(moment.noteId);
    if (!existingNote) {
      issues.push('missing-note');
      recovery.push({
        reason: 'missing-note',
        momentId: moment.id,
        noteId: moment.noteId,
        moment,
        canonicalSource: 'moment',
      });
    }
    return [canonicalRecord(
      moment,
      existingNote ?? fallbackNoteForMoment(moment),
      sortOrder,
      recovery,
      issues,
    )];
  });

  noteById.forEach((note, noteId) => {
    if (noteOwners.has(noteId)) return;
    issues.push('missing-moment');
    recovery.push({ reason: 'missing-moment', noteId, note });
  });

  const conversations = source.conversations.map((conversation, sortOrder) => ({
    id: conversation.id,
    sortOrder,
    title: conversation.title,
    badge: conversation.badge,
    unread: conversation.unread,
    proactive: conversation.proactive,
    kind: conversation.kind === 'companion' ? 'companion' as const : 'regular' as const,
  }));
  const messages = source.conversations.flatMap((conversation) =>
    conversation.messages.flatMap((message, sortOrder) =>
      message.deliveryState === 'pending'
        ? []
        : [{ ...structuredClone(message), conversationId: conversation.id, sortOrder }]),
  );

  return {
    snapshot: {
      settings: {
        schemaVersion: source.schemaVersion,
        themeTone: source.themeTone,
        themePalette: structuredClone(source.themePalette),
      },
      preferences: normalizeEmotionPreferences(localSettings),
      records,
      conversations,
      messages,
      followUps: source.followUps.map((item, sortOrder) => ({
        ...structuredClone(item), sortOrder,
      })),
      revisits: source.revisits.map((item, sortOrder) => ({
        ...structuredClone(item), sortOrder,
      })),
    },
    issues: [...new Set(issues)],
    recovery,
  };
};

export const assembleNormalizedEmotionSnapshot = (
  normalized: NormalizedEmotionSnapshot,
  deviceState: {
    lastConversationId?: string;
    lastViewport?: MapViewport;
  } = {},
): AppDataSnapshot => {
  const messagesByConversation = new Map<string, typeof normalized.messages>();
  normalized.messages.forEach((message) => {
    const values = messagesByConversation.get(message.conversationId) ?? [];
    values.push(message);
    messagesByConversation.set(message.conversationId, values);
  });
  const conversations = [...normalized.conversations]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
    .map((conversation) => {
      const messages = [...(messagesByConversation.get(conversation.id) ?? [])]
        .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
        .map(({ conversationId: _conversationId, sortOrder: _sortOrder, ...message }) => message);
      return {
        id: conversation.id,
        title: conversation.title,
        preview: messages.at(-1)?.body.slice(0, 1_000) ?? '',
        badge: conversation.badge,
        unread: conversation.unread,
        proactive: conversation.proactive,
        kind: conversation.kind,
        messages,
      };
    });
  const pairs = [...normalized.records]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.momentId.localeCompare(right.momentId))
    .map((record) => {
      const temporal = {
        occurredAtUtc: record.occurredAtUtc,
        localDate: record.localDate,
        localTime: record.localTime,
        timeZone: record.timeZone,
        utcOffsetMinutes: record.utcOffsetMinutes,
        timePrecision: record.timePrecision,
        eventTimeSource: record.eventTimeSource,
      };
      return {
        moment: {
          id: record.momentId,
          noteId: record.noteId,
          emotion: record.emotion,
          intensity: record.emotion === null ? 0 : record.intensity,
          place: record.place,
          date: record.localDate,
          time: record.localTime,
          longitude: record.longitude,
          latitude: record.latitude,
          placeRating: record.placeRating,
          color: record.color ?? undefined,
          tagGroupId: record.tagGroupId ?? undefined,
          tagOrder: record.tagOrder ?? undefined,
          isNew: record.isNew || undefined,
          source: record.source ?? undefined,
          photoTakenAt: record.photoTakenAt ?? undefined,
          photoTakenAtKind: record.photoTakenAtKind ?? undefined,
          photoTakenAtSource: record.photoTakenAtSource ?? undefined,
          importedAt: record.importedAt ?? undefined,
          locationCapturedAt: record.locationCapturedAt ?? undefined,
          locationTimeRelation: record.locationTimeRelation ?? undefined,
          ...temporal,
        } satisfies EmotionMoment,
        note: {
          id: record.noteId,
          title: record.title,
          titleSource: record.titleSource ?? undefined,
          place: record.place,
          date: record.localDate,
          time: record.localTime,
          emotion: record.emotion,
          color: record.color ?? undefined,
          placeRating: record.placeRating,
          answers: structuredClone(record.answers),
          excerpt: record.excerpt,
          isDraft: record.isDraft || undefined,
          followUpEnabled: record.followUpEnabled,
          image: record.image ? structuredClone(record.image) : undefined,
          ...temporal,
        } satisfies EmotionNote,
      };
    });
  return {
    schemaVersion: normalized.settings.schemaVersion,
    dataMode: 'real',
    moments: pairs.map((pair) => pair.moment),
    notes: pairs.map((pair) => pair.note),
    conversations,
    followUps: [...normalized.followUps]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
      .map(({ sortOrder: _sortOrder, ...record }) => record),
    revisits: [...normalized.revisits]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
      .map(({ sortOrder: _sortOrder, ...record }) => record),
    themeTone: normalized.settings.themeTone,
    themePalette: structuredClone(normalized.settings.themePalette),
    ...deviceState,
  };
};

export const isEmotionPreferencesEntityValid = (
  value: EmotionPreferencesEntity,
) => normalizeAvatarSrc(value.avatarSrc) === value.avatarSrc &&
  ['zh', 'en', 'ko'].includes(value.language) &&
  value.profileName.length <= 80 && value.aboutMe.length <= 2_000 &&
  value.aiUserPrompt.length <= 500 &&
  value.aiContextMessageCount >= MIN_AI_CONTEXT_MESSAGE_COUNT &&
  value.aiContextMessageCount <= MAX_AI_CONTEXT_MESSAGE_COUNT &&
  value.chatPreferenceTags.length <= 20 &&
  JSON.stringify(normalizeFollowUpCurve(value.followUpIntervals)) ===
    JSON.stringify(value.followUpIntervals);
