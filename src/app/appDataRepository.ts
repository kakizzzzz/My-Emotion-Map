import {
  INITIAL_MOMENTS,
  INITIAL_NOTES,
} from '../data';
import type {
  AppDataSnapshot,
  ChatOption,
  ChatMessage,
  Conversation,
  DataMode,
  EmotionKey,
  EmotionMoment,
  EmotionNote,
  FollowUpRecord,
  PlaceRating,
  StarInboxItem,
} from '../types';
import { createDemoAppData } from './demoData';
import {
  DEFAULT_THEME,
  isThemePalette,
} from './themePreferences';
import {
  migrateLegacyHiddenDefaults,
  relinkLegacyInboxDrafts,
  sanitizeStarInboxItem,
} from './appDataV3';
import { migrateLegacyTemporalFields } from '../domain/time/temporal';
import { sanitizeExternalEvidence } from './sanitizeExternalEvidence';
import {
  LEGACY_APP_DATA_STORAGE_KEY,
  isWorkspaceWithinBudget,
  stableSerialize,
  workspaceStorageKey,
  legacyUserWorkspaceStorageKey,
} from './workspace/workspaceStorage';
import {
  chatWorkspaceKey,
  clearChatDraftsForWorkspace,
  clearLegacyChatDrafts,
} from './workspace/chatDraftStorage';
import { clearInboxLocation } from './recordAssociations';
import { sanitizeRevisits } from './appDataRevisits';

export const APP_DATA_STORAGE_KEY = LEGACY_APP_DATA_STORAGE_KEY;
export const CURRENT_SCHEMA_VERSION = 6;

export type AppDataLoadIssue =
  | 'storage-unavailable'
  | 'corrupt-json'
  | 'invalid-import'
  | 'upgrade-required';

export type LoadedAppData = AppDataSnapshot & {
  loadIssue?: AppDataLoadIssue;
  migrationIssues?: string[];
  upgradeRequiredVersion?: number;
};

export type AppDataMigrationResult =
  | { status: 'ok'; snapshot: AppDataSnapshot; issues: string[] }
  | { status: 'upgrade_required'; sourceVersion: number }
  | { status: 'invalid'; issues: string[] };

const EMOTIONS: ReadonlySet<EmotionKey> = new Set([
  'calm',
  'joy',
  'tender',
  'curious',
  'energized',
  'connected',
  'heavy',
  'restless',
  'focused',
  'overwhelmed',
  'numb',
  'mixed',
]);

const PLACE_RATINGS: ReadonlySet<PlaceRating> = new Set([
  'safe',
  'comfortable',
  'neutral',
  'uneasy',
  'distressing',
]);

const FOLLOW_UP_STATUSES = new Set([
  'queued',
  'active',
  'answered',
  'skipped',
]);

const PROMPT_ROLES = new Set(['purpose', 'ai', 'fallback', 'legacy']);
const PURPOSE_PROMPTS = new Set([
  '你去这里做什么？',
  '你去这做什么？',
  'What did you do here?',
  'What did you come here to do?',
  '여기에서 무엇을 했나요?',
  '여기에 무엇을 하러 왔나요?',
]);
const LEGACY_UNTITLED = new Set([
  '',
  '没有标题的一刻',
  '未命名的瞬间',
  'Untitled moment',
  '제목 없는 순간',
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown, maxLength = 10_000) =>
  typeof value === 'string' ? value.slice(0, maxLength) : '';

export const isValidDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

export const isValidTime = (value: unknown): value is string =>
  typeof value === 'string' && CLOCK_TIME.test(value);

export const isValidTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  !Number.isNaN(new Date(value).getTime());

const isEmotion = (value: unknown): value is EmotionKey =>
  typeof value === 'string' && EMOTIONS.has(value as EmotionKey);

const isPlaceRating = (value: unknown): value is PlaceRating =>
  typeof value === 'string' && PLACE_RATINGS.has(value as PlaceRating);

export const isValidCoordinate = (
  latitude: unknown,
  longitude: unknown,
) =>
  typeof latitude === 'number' &&
  Number.isFinite(latitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  typeof longitude === 'number' &&
  Number.isFinite(longitude) &&
  longitude >= -180 &&
  longitude <= 180;

const sanitizeMoment = (
  value: unknown,
  issues: string[],
): EmotionMoment | null => {
  const source = asObject(value);
  if (!source) return null;
  if (
    !asString(source.id, 200) ||
    !asString(source.noteId, 200) ||
    !isValidCoordinate(source.latitude, source.longitude) ||
    !isValidDate(source.date) ||
    !isValidTime(source.time)
  ) {
    issues.push('moment-dropped');
    return null;
  }
  const intensity =
    typeof source.intensity === 'number' && Number.isFinite(source.intensity)
      ? Math.min(5, Math.max(0, Math.round(source.intensity)))
      : 0;
  if (intensity !== source.intensity) issues.push('moment-intensity-normalized');
  return {
    id: asString(source.id, 200),
    noteId: asString(source.noteId, 200),
    emotion: isEmotion(source.emotion) ? source.emotion : null,
    intensity: isEmotion(source.emotion) ? intensity : 0,
    place: asString(source.place, 500),
    date: source.date,
    time: source.time,
    latitude: source.latitude as number,
    longitude: source.longitude as number,
    placeRating: isPlaceRating(source.placeRating) ? source.placeRating : null,
    color:
      typeof source.color === 'string' && /^#[0-9a-f]{6}$/i.test(source.color)
        ? source.color
        : undefined,
    tagGroupId:
      typeof source.tagGroupId === 'number' &&
      Number.isFinite(source.tagGroupId)
        ? source.tagGroupId
        : undefined,
    tagOrder:
      typeof source.tagOrder === 'number' && source.tagOrder > 0
        ? Math.round(source.tagOrder)
        : undefined,
    isNew: source.isNew === true ? true : undefined,
    isInboxDraft: source.isInboxDraft === true ? true : undefined,
    heartRate:
      typeof source.heartRate === 'number' &&
      Number.isFinite(source.heartRate) &&
      source.heartRate >= 20 &&
      source.heartRate <= 260
        ? Math.round(source.heartRate)
        : undefined,
    source:
      source.source === 'manual' ||
      source.source === 'current-location' ||
      source.source === 'photo' ||
      source.source === 'inbox'
        ? source.source
        : undefined,
    photoTakenAt: isValidTimestamp(source.photoTakenAt)
      ? source.photoTakenAt
      : undefined,
    photoTakenAtKind:
      source.photoTakenAtKind === 'local' || source.photoTakenAtKind === 'offset'
        ? source.photoTakenAtKind
        : undefined,
    photoTakenAtSource:
      source.photoTakenAtSource === 'DateTimeOriginal' ||
      source.photoTakenAtSource === 'CreateDate'
        ? source.photoTakenAtSource
        : undefined,
    importedAt: isValidTimestamp(source.importedAt)
      ? source.importedAt
      : undefined,
    locationCapturedAt: isValidTimestamp(source.locationCapturedAt)
      ? source.locationCapturedAt
      : undefined,
    locationTimeRelation:
      source.locationTimeRelation === 'event' ||
      source.locationTimeRelation === 'confirmation' ||
      source.locationTimeRelation === 'manual'
        ? source.locationTimeRelation
        : undefined,
    ...migrateLegacyTemporalFields({
      date: source.date,
      time: source.time,
      occurredAtUtc: isValidTimestamp(source.occurredAtUtc)
        ? source.occurredAtUtc
        : null,
      localDate: isValidDate(source.localDate) ? source.localDate : source.date,
      localTime: isValidTime(source.localTime) ? source.localTime : source.time,
      timeZone:
        typeof source.timeZone === 'string'
          ? source.timeZone.slice(0, 100)
          : null,
      utcOffsetMinutes:
        typeof source.utcOffsetMinutes === 'number'
          ? source.utcOffsetMinutes
          : null,
      timePrecision:
        source.timePrecision === 'date' || source.timePrecision === 'unknown'
          ? source.timePrecision
          : 'minute',
      eventTimeSource:
        source.eventTimeSource === 'user' ||
        source.eventTimeSource === 'device-created' ||
        source.eventTimeSource === 'photo-exif' ||
        source.eventTimeSource === 'health-sample'
          ? source.eventTimeSource
          : 'legacy',
    }),
  };
};

const sanitizeNote = (
  value: unknown,
  issues: string[],
): EmotionNote | null => {
  const source = asObject(value);
  if (
    !source ||
    !asString(source.id, 200) ||
    !isValidDate(source.date) ||
    !isValidTime(source.time)
  ) {
    issues.push('note-dropped');
    return null;
  }
  const answers = Array.isArray(source.answers)
    ? source.answers
        .map((answer, index) => {
          const item = asObject(answer);
          if (!item) return null;
          const id = asString(item.id, 200);
          const question = asString(item.question, 1_000);
          if (!id || !question) return null;
          return {
            id,
            question,
            answer: asString(item.answer, 20_000),
            role: PROMPT_ROLES.has(String(item.role))
              ? (item.role as 'purpose' | 'ai' | 'fallback' | 'legacy')
              : index === 0 && PURPOSE_PROMPTS.has(question)
                ? 'purpose'
                : 'legacy',
          };
        })
        .filter((answer): answer is NonNullable<typeof answer> =>
          Boolean(answer),
        )
    : [];
  return {
    id: asString(source.id, 200),
    title: asString(source.title, 500),
    titleSource:
      source.titleSource === 'user' ||
      source.titleSource === 'ai' ||
      source.titleSource === 'fallback'
        ? source.titleSource
        : LEGACY_UNTITLED.has(asString(source.title, 500).trim())
          ? 'fallback'
          : 'user',
    place: asString(source.place, 500),
    date: source.date,
    time: source.time,
    emotion: isEmotion(source.emotion) ? source.emotion : null,
    color:
      typeof source.color === 'string' && /^#[0-9a-f]{6}$/i.test(source.color)
        ? source.color
        : undefined,
    placeRating: isPlaceRating(source.placeRating) ? source.placeRating : null,
    answers,
    excerpt: asString(source.excerpt, 5_000),
    isDraft: source.isDraft === true ? true : undefined,
    followUpEnabled:
      typeof source.followUpEnabled === 'boolean'
        ? source.followUpEnabled
        : undefined,
    ...migrateLegacyTemporalFields({
      date: source.date,
      time: source.time,
      occurredAtUtc: isValidTimestamp(source.occurredAtUtc)
        ? source.occurredAtUtc
        : null,
      localDate: isValidDate(source.localDate) ? source.localDate : source.date,
      localTime: isValidTime(source.localTime) ? source.localTime : source.time,
      timeZone:
        typeof source.timeZone === 'string'
          ? source.timeZone.slice(0, 100)
          : null,
      utcOffsetMinutes:
        typeof source.utcOffsetMinutes === 'number'
          ? source.utcOffsetMinutes
          : null,
      timePrecision:
        source.timePrecision === 'date' || source.timePrecision === 'unknown'
          ? source.timePrecision
          : 'minute',
      eventTimeSource:
        source.eventTimeSource === 'user' ||
        source.eventTimeSource === 'device-created' ||
        source.eventTimeSource === 'photo-exif' ||
        source.eventTimeSource === 'health-sample'
          ? source.eventTimeSource
          : 'legacy',
    }),
  };
};

const sanitizeMessage = (
  value: unknown,
  issues: string[],
): ChatMessage | null => {
  const source = asObject(value);
  if (
    !source ||
    !asString(source.id, 200) ||
    (source.role !== 'user' && source.role !== 'assistant') ||
    typeof source.body !== 'string'
  ) {
    issues.push('message-dropped');
    return null;
  }
  return {
    id: asString(source.id, 200),
    role: source.role,
    body: asString(source.body, 20_000),
    kind:
      source.kind === 'clarification' ||
      source.kind === 'followup_prompt' ||
      source.kind === 'followup_answer' ||
      source.kind === 'followup_reply'
        ? source.kind
        : 'message',
    noteIds: Array.isArray(source.noteIds)
      ? source.noteIds
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 20)
      : undefined,
    externalEvidence: sanitizeExternalEvidence(source.externalEvidence),
    options: Array.isArray(source.options)
      ? source.options
          .map((option) => {
            const item = asObject(option);
            const legacyKind = item?.responseKind;
            const responseKind =
              legacyKind === 'calm'
                ? 'lighter'
                : legacyKind === 'unchanged'
                  ? 'same'
                  : legacyKind;
            if (
              !item ||
              !asString(item.id, 200) ||
              !asString(item.label, 1_000) ||
              (responseKind !== 'lighter' &&
                responseKind !== 'stronger' &&
                responseKind !== 'different' &&
                responseKind !== 'same' &&
                responseKind !== 'skip')
            ) {
              return null;
            }
            return {
              id: asString(item.id, 200),
              label: asString(item.label, 1_000),
              responseKind,
            } satisfies ChatOption;
          })
          .filter((option): option is ChatOption => Boolean(option))
      : undefined,
    clarificationOptions: Array.isArray(source.clarificationOptions)
      ? source.clarificationOptions
          .map(asObject)
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .flatMap((item) => {
            const optionId = asString(item.optionId, 200);
            const label = asString(item.label, 300);
            const continuationToken = asString(item.continuationToken, 4_000);
            return optionId && label && continuationToken
              ? [{ optionId, label, continuationToken }]
              : [];
          })
          .slice(0, 3)
      : undefined,
    requestId: asString(source.requestId, 200) || undefined,
    replyToRequestId: asString(source.replyToRequestId, 200) || undefined,
    deliveryState:
      source.deliveryState === 'pending' ||
      source.deliveryState === 'delivered' ||
      source.deliveryState === 'failed' ||
      source.deliveryState === 'stopped'
        ? source.deliveryState
        : undefined,
    referenceConfirmation: (() => {
      const reference = asObject(source.referenceConfirmation);
      const optionId = asString(reference?.optionId, 200);
      const continuationToken = asString(reference?.continuationToken, 4_000);
      return optionId && continuationToken
        ? { optionId, continuationToken }
        : undefined;
    })(),
    followUpId:
      typeof source.followUpId === 'string'
        ? source.followUpId.slice(0, 200)
        : undefined,
    createdAt: isValidTimestamp(source.createdAt)
      ? source.createdAt
      : undefined,
  };
};

const sanitizeConversation = (
  value: unknown,
  issues: string[],
): Conversation | null => {
  const source = asObject(value);
  if (!source || !asString(source.id, 200)) return null;
  return {
    id: asString(source.id, 200),
    title: asString(source.title, 500),
    preview: asString(source.preview, 1_000),
    unread: typeof source.unread === 'boolean' ? source.unread : undefined,
    badge: asString(source.badge, 100) || undefined,
    proactive: source.proactive === true ? true : undefined,
    kind: source.kind === 'companion' ? 'companion' : 'regular',
    messages: Array.isArray(source.messages)
      ? source.messages
          .map((message) => sanitizeMessage(message, issues))
          .filter((message): message is ChatMessage => Boolean(message))
      : [],
  };
};

const sanitizeFollowUp = (
  value: unknown,
  issues: string[],
): FollowUpRecord | null => {
  const source = asObject(value);
  if (
    !source ||
    !asString(source.id, 200) ||
    !asString(source.noteId, 200) ||
    (source.intervalDays !== 1 &&
      source.intervalDays !== 3 &&
      source.intervalDays !== 7) ||
    !isValidTimestamp(source.dueAt) ||
    !FOLLOW_UP_STATUSES.has(String(source.status))
  ) {
    issues.push('follow-up-dropped');
    return null;
  }
  return {
    id: asString(source.id, 200),
    noteId: asString(source.noteId, 200),
    intervalDays: source.intervalDays,
    dueAt: source.dueAt,
    status: source.status as FollowUpRecord['status'],
    prompt: asString(source.prompt, 5_000) || undefined,
    promptVersion:
      typeof source.promptVersion === 'number' && source.promptVersion > 0
        ? Math.round(source.promptVersion)
        : 1,
    followUpConsentedAt: isValidTimestamp(source.followUpConsentedAt)
      ? source.followUpConsentedAt
      : new Date(
          new Date(source.dueAt as string).getTime() -
            Number(source.intervalDays) * 86_400_000,
        ).toISOString(),
    responseOptionId:
      source.responseOptionId === 'lighter' ||
      source.responseOptionId === 'stronger' ||
      source.responseOptionId === 'different' ||
      source.responseOptionId === 'same' ||
      source.responseOptionId === 'skip'
        ? source.responseOptionId
        : source.responseKind === 'calm'
          ? 'lighter'
          : source.responseKind === 'unchanged'
            ? 'same'
            : source.responseKind === 'stronger' ||
                source.responseKind === 'different' ||
                source.responseKind === 'skip'
              ? source.responseKind
              : undefined,
    answerCommandId: asString(source.answerCommandId, 200) || undefined,
    promptedAt: isValidTimestamp(source.promptedAt)
      ? source.promptedAt
      : undefined,
    response: asString(source.response, 5_000) || undefined,
    responseKind:
      source.responseKind === 'positive'
        ? 'legacyPositive'
        : source.responseKind === 'legacyPositive' ||
      source.responseKind === 'calm' ||
      source.responseKind === 'lighter' ||
      source.responseKind === 'stronger' ||
      source.responseKind === 'different' ||
      source.responseKind === 'unchanged' ||
      source.responseKind === 'same' ||
      source.responseKind === 'skip'
        ? source.responseKind
        : undefined,
    answeredVia:
      source.answeredVia === 'chat' || source.answeredVia === 'inbox'
        ? source.answeredVia
        : undefined,
    answeredAt: isValidTimestamp(source.answeredAt)
      ? source.answeredAt
      : undefined,
    assistantReply: asString(source.assistantReply, 5_000) || undefined,
    seenAt: isValidTimestamp(source.seenAt) ? source.seenAt : undefined,
  };
};

export const createEmptyAppData = (): AppDataSnapshot => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  dataMode: 'real',
  moments: [],
  notes: [],
  conversations: [],
  followUps: [],
  revisits: [],
  starInboxItems: [],
  themeTone: 'original',
  themePalette: DEFAULT_THEME,
});
export { createDemoAppData } from './demoData';
export {
  appendRevisitRecord,
  dismissInboxItem,
  removeMomentAssociations,
  setRevisitCurrentEmotion,
  upsertFollowUpRevisit,
} from './recordAssociations';

const inferLegacyDataMode = (
  moments: EmotionMoment[],
  notes: EmotionNote[],
): DataMode => {
  const seedMomentIds = new Set(INITIAL_MOMENTS.map((item) => item.id));
  const seedNoteIds = new Set(INITIAL_NOTES.map((item) => item.id));
  const exactSeed =
    moments.length === seedMomentIds.size &&
    notes.length === seedNoteIds.size &&
    moments.every((item) => seedMomentIds.has(item.id)) &&
    notes.every((item) => seedNoteIds.has(item.id));
  return exactSeed ? 'demo' : 'real';
};

export const migrateAppData = (
  value: unknown,
): AppDataMigrationResult => {
  const issues: string[] = [];
  const source = asObject(value);
  if (!source) {
    return { status: 'invalid', issues: ['root-invalid'] };
  }
  const sourceVersion =
    typeof source.schemaVersion === 'number' ? source.schemaVersion : 1;
  if (sourceVersion > CURRENT_SCHEMA_VERSION) {
    return { status: 'upgrade_required', sourceVersion };
  }
  const rawMoments = Array.isArray(source.moments)
    ? source.moments
        .map((item) => sanitizeMoment(item, issues))
        .filter((item): item is EmotionMoment => Boolean(item))
    : [];
  const seenMomentNoteIds = new Set<string>();
  const moments = rawMoments.filter((moment) => {
    if (seenMomentNoteIds.has(moment.noteId)) {
      issues.push('duplicate-moment-note-dropped');
      return false;
    }
    seenMomentNoteIds.add(moment.noteId);
    return true;
  });
  const rawNotes = Array.isArray(source.notes)
    ? source.notes
        .map((item) => sanitizeNote(item, issues))
        .filter((item): item is EmotionNote => Boolean(item))
    : [];
  const seenNoteIds = new Set<string>();
  const notes = rawNotes.filter((note) => {
    if (seenNoteIds.has(note.id)) {
      issues.push('duplicate-note-dropped');
      return false;
    }
    seenNoteIds.add(note.id);
    return true;
  });
  const noteById = migrateLegacyHiddenDefaults(
    sourceVersion,
    moments,
    notes,
    issues,
  );
  const noteIds = new Set(notes.map((note) => note.id));
  for (const moment of moments) {
    if (noteIds.has(moment.noteId)) continue;
    notes.push({
      id: moment.noteId,
      title: '',
      place: moment.place,
      date: moment.date,
      time: moment.time,
      emotion: moment.emotion,
      placeRating: moment.placeRating,
      answers: [],
      excerpt: '',
      isDraft: true,
    });
    noteIds.add(moment.noteId);
    issues.push('missing-note-recovered');
  }
  const conversations = Array.isArray(source.conversations)
    ? source.conversations
        .map((item) => sanitizeConversation(item, issues))
        .filter((item): item is Conversation => Boolean(item))
    : [];
  const companion =
    conversations.find(
      (conversation) =>
        conversation.id === 'thread-revisit' ||
        conversation.kind === 'companion',
    ) ?? null;
  const normalizedConversations = [
    ...(companion
      ? [{ ...companion, id: 'thread-revisit', kind: 'companion' as const }]
      : []),
    ...conversations
      .filter((conversation) => conversation !== companion)
      .map((conversation) => ({
        ...conversation,
        kind: 'regular' as const,
        messages: conversation.messages.map((message) => ({
          ...message,
          noteIds: message.noteIds?.filter((noteId) => noteIds.has(noteId)),
        })),
      })),
  ];
  const sanitizedFollowUps = Array.isArray(source.followUps)
    ? source.followUps
        .map((item) => sanitizeFollowUp(item, issues))
        .filter(
          (item): item is FollowUpRecord =>
            Boolean(item && noteIds.has(item.noteId)),
        )
    : [];
  const activeFollowUps = sanitizedFollowUps
    .filter((record) => record.status === 'active')
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  const activeToKeep = activeFollowUps[0]?.id;
  const followUps = sanitizedFollowUps.map((record) =>
    record.status === 'active' && record.id !== activeToKeep
      ? { ...record, status: 'queued' as const, promptedAt: undefined }
      : record,
  );
  const followUpIds = new Set(followUps.map((record) => record.id));
  const followUpById = new Map(followUps.map((record) => [record.id, record]));
  const revisits = sanitizeRevisits(
    source.revisits,
    issues,
    noteIds,
    followUpById,
  );
  const momentIds = new Set(moments.map((moment) => moment.id));
  const starInboxItems = Array.isArray(source.starInboxItems)
    ? source.starInboxItems
        .map((item) => sanitizeStarInboxItem(item, issues))
        .filter((item): item is StarInboxItem => Boolean(item))
        .map((item) =>
          item.linkedMomentId && !momentIds.has(item.linkedMomentId)
            ? clearInboxLocation(item)
            : item,
        )
    : [];
  relinkLegacyInboxDrafts(starInboxItems, moments, noteById);
  const dataMode: DataMode =
    source.dataMode === 'demo' || source.dataMode === 'real'
      ? source.dataMode
      : inferLegacyDataMode(moments, notes);
  const themeTone =
    source.themeTone === 'terracotta' ||
    source.themeTone === 'blue' ||
    source.themeTone === 'mauve'
      ? source.themeTone
      : 'original';
  const themePalette = isThemePalette(source.themePalette)
    ? source.themePalette
    : DEFAULT_THEME;
  return {
    status: 'ok',
    snapshot: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      dataMode,
      moments,
      notes,
      conversations: normalizedConversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages
          .filter(
            (message) =>
              !message.followUpId ||
              followUpIds.has(message.followUpId) ||
              message.kind === 'message',
          )
          .map((message) =>
            message.followUpId && !followUpIds.has(message.followUpId)
              ? { ...message, followUpId: undefined, options: undefined }
              : message.followUpId &&
                  (followUpById.get(message.followUpId)?.status === 'answered' ||
                    followUpById.get(message.followUpId)?.status === 'skipped')
                ? { ...message, options: undefined }
                : message,
          ),
      })),
      followUps,
      revisits,
      starInboxItems,
      themeTone,
      themePalette,
      demoAnchorDate: isValidDate(source.demoAnchorDate)
        ? source.demoAnchorDate
        : undefined,
      lastConversationId: asString(source.lastConversationId, 200) || undefined,
      lastViewport:
        asObject(source.lastViewport) &&
        isValidCoordinate(
          asObject(source.lastViewport)?.latitude,
          asObject(source.lastViewport)?.longitude,
        ) &&
        typeof asObject(source.lastViewport)?.zoom === 'number'
          ? {
              latitude: asObject(source.lastViewport)?.latitude as number,
              longitude: asObject(source.lastViewport)?.longitude as number,
              zoom: Math.min(
                20,
                Math.max(0, asObject(source.lastViewport)?.zoom as number),
              ),
            }
          : undefined,
    },
    issues: Array.from(new Set(issues)),
  };
};

export const loadAppData = (
  userId: string | null,
  mode: DataMode = 'real',
): LoadedAppData => {
  try {
    const key = workspaceStorageKey(mode, userId);
    if (!key) return createEmptyAppData();
    const stored = window.localStorage.getItem(key) ?? (
      mode === 'real' && userId
        ? window.localStorage.getItem(legacyUserWorkspaceStorageKey(userId))
        : null
    );
    if (!stored) return mode === 'demo' ? createDemoAppData() : createEmptyAppData();
    try {
      const migrated = migrateAppData(JSON.parse(stored));
      if (migrated.status === 'upgrade_required') {
        return {
          ...(mode === 'demo' ? createDemoAppData() : createEmptyAppData()),
          loadIssue: 'upgrade-required',
          upgradeRequiredVersion: migrated.sourceVersion,
        };
      }
      if (migrated.status === 'invalid') {
        return {
          ...(mode === 'demo' ? createDemoAppData() : createEmptyAppData()),
          loadIssue: 'corrupt-json',
        };
      }
      const { snapshot, issues } = migrated;
      if (snapshot.dataMode !== mode) {
        return {
          ...(mode === 'demo' ? createDemoAppData() : createEmptyAppData()),
          loadIssue: 'corrupt-json',
        };
      }
      return {
        ...snapshot,
        migrationIssues: issues.length ? issues : undefined,
      };
    } catch {
      return { ...createEmptyAppData(), loadIssue: 'corrupt-json' };
    }
  } catch {
    return { ...createEmptyAppData(), loadIssue: 'storage-unavailable' };
  }
};

export const saveAppData = (
  snapshot: AppDataSnapshot,
  userId: string | null,
) => {
  try {
    const key = workspaceStorageKey(snapshot.dataMode, userId);
    if (!key || !isWorkspaceWithinBudget(snapshot)) return false;
    window.localStorage.setItem(
      key,
      JSON.stringify({ ...snapshot, schemaVersion: CURRENT_SCHEMA_VERSION }),
    );
    return true;
  } catch {
    return false;
  }
};

export const parseImportedAppData = (
  text: string,
):
  | { ok: true; snapshot: AppDataSnapshot; issues: string[] }
  | {
      ok: false;
      issue: AppDataLoadIssue;
      sourceVersion?: number;
    } => {
  try {
    const parsed = JSON.parse(text);
    if (!asObject(parsed)) return { ok: false, issue: 'invalid-import' };
    const migrated = migrateAppData(parsed);
    if (migrated.status === 'upgrade_required') {
      return {
        ok: false,
        issue: 'upgrade-required',
        sourceVersion: migrated.sourceVersion,
      };
    }
    if (migrated.status === 'invalid') {
      return { ok: false, issue: 'invalid-import' };
    }
    return { ok: true, snapshot: migrated.snapshot, issues: migrated.issues };
  } catch {
    return { ok: false, issue: 'corrupt-json' };
  }
};

export const serializeAppData = (snapshot: AppDataSnapshot) =>
  JSON.stringify(
    { ...snapshot, schemaVersion: CURRENT_SCHEMA_VERSION },
    null,
    2,
  );

export const clearAllLocalData = (userId: string | null, mode: DataMode) => {
  const activeKey = workspaceStorageKey(mode, userId);
  const keys = [
    activeKey,
    userId ? legacyUserWorkspaceStorageKey(userId) : null,
    userId ? `my-emotion-map.user-preferences.${userId}.v2` : null,
    userId ? `my-emotion-map.health-preferences.${userId}.v2` : null,
    userId ? `my-emotion-map.shortcut-heart-dedupe.${userId}.v2` : null,
  ];
  try {
    keys.forEach((key) => {
      if (key) window.localStorage.removeItem(key);
    });
    return clearLegacyChatDrafts() && clearChatDraftsForWorkspace(
      chatWorkspaceKey(userId, mode),
    );
  } catch {
    return false;
  }
};

export const hasLegacyUnassignedWorkspace = () => {
  try {
    return window.localStorage.getItem(LEGACY_APP_DATA_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
};

export const getWorkspaceStorageKey = (
  userId: string | null,
  mode: DataMode,
) => workspaceStorageKey(mode, userId);

export const canonicalSnapshotDigest = (snapshot: AppDataSnapshot) =>
  stableSerialize({ ...snapshot, schemaVersion: CURRENT_SCHEMA_VERSION });

export const validateReferentialIntegrity = (snapshot: AppDataSnapshot) => {
  const issues: string[] = [];
  const noteIds = new Set(snapshot.notes.map((note) => note.id));
  const momentIds = new Set(snapshot.moments.map((moment) => moment.id));
  const followUpIds = new Set(snapshot.followUps.map((record) => record.id));
  const noteOwners = new Map<string, number>();
  snapshot.moments.forEach((moment) => {
    noteOwners.set(moment.noteId, (noteOwners.get(moment.noteId) ?? 0) + 1);
    if (!noteIds.has(moment.noteId)) issues.push('moment-note-missing');
  });
  if ([...noteOwners.values()].some((count) => count !== 1)) {
    issues.push('moment-note-not-unique');
  }
  if (snapshot.followUps.some((record) => !noteIds.has(record.noteId))) {
    issues.push('followup-note-missing');
  }
  if (snapshot.revisits.some((record) => !noteIds.has(record.noteId))) {
    issues.push('revisit-note-missing');
  }
  if (
    snapshot.conversations.some((conversation) =>
      conversation.messages.some(
        (message) =>
          Boolean(message.followUpId) &&
          !followUpIds.has(message.followUpId as string) &&
          message.kind !== 'message',
      ),
    )
  ) {
    issues.push('message-followup-missing');
  }
  if (
    snapshot.starInboxItems.some(
      (item) => item.linkedMomentId && !momentIds.has(item.linkedMomentId),
    )
  ) {
    issues.push('inbox-moment-missing');
  }
  if (snapshot.followUps.filter((record) => record.status === 'active').length > 1) {
    issues.push('multiple-active-followups');
  }
  return Array.from(new Set(issues));
};
