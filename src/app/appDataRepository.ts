import {
  INITIAL_CONVERSATIONS,
  INITIAL_FOLLOW_UPS,
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
  RevisitRecord,
  StarInboxItem,
} from '../types';
import { createRecordId } from './createRecordId';
import {
  DEFAULT_THEME,
  isThemePalette,
  protectThemePaletteContrast,
} from './themePreferences';
import {
  DEMO_INBOX_ITEMS,
  migrateLegacyHiddenDefaults,
  relinkLegacyInboxDrafts,
  sanitizeStarInboxItem,
} from './appDataV3';

export const APP_DATA_STORAGE_KEY = 'my-emotion-map.app-data.v1';
export const CURRENT_SCHEMA_VERSION = 3;

export type AppDataLoadIssue =
  | 'storage-unavailable'
  | 'corrupt-json'
  | 'invalid-import';

export type LoadedAppData = AppDataSnapshot & {
  loadIssue?: AppDataLoadIssue;
  migrationIssues?: string[];
};

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
    eventTimeSource:
      source.eventTimeSource === 'user' ||
      source.eventTimeSource === 'device-created' ||
      source.eventTimeSource === 'photo-exif' ||
      source.eventTimeSource === 'health-sample' ||
      source.eventTimeSource === 'legacy'
        ? source.eventTimeSource
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
    noteIds: Array.isArray(source.noteIds)
      ? source.noteIds
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 20)
      : undefined,
    options: Array.isArray(source.options)
      ? source.options
          .map((option) => {
            const item = asObject(option);
            const responseKind = item?.responseKind;
            if (
              !item ||
              !asString(item.id, 200) ||
              !asString(item.label, 1_000) ||
              (responseKind !== 'positive' &&
                responseKind !== 'calm' &&
                responseKind !== 'stronger' &&
                responseKind !== 'different' &&
                responseKind !== 'unchanged' &&
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
    prompt: asString(source.prompt, 5_000),
    promptedAt: isValidTimestamp(source.promptedAt)
      ? source.promptedAt
      : undefined,
    response: asString(source.response, 5_000) || undefined,
    responseKind:
      source.responseKind === 'positive' ||
      source.responseKind === 'calm' ||
      source.responseKind === 'stronger' ||
      source.responseKind === 'different' ||
      source.responseKind === 'unchanged' ||
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

const sanitizeRevisit = (
  value: unknown,
  issues: string[],
): RevisitRecord | null => {
  const source = asObject(value);
  if (
    !source ||
    !asString(source.id, 200) ||
    !asString(source.noteId, 200) ||
    !(source.originalEmotion === null || isEmotion(source.originalEmotion)) ||
    !isEmotion(source.revisitedEmotion) ||
    !isValidTimestamp(source.originalOccurredAt) ||
    !isValidTimestamp(source.revisitedAt)
  ) {
    issues.push('revisit-dropped');
    return null;
  }
  return {
    id: asString(source.id, 200),
    noteId: asString(source.noteId, 200),
    originalEmotion: source.originalEmotion as EmotionKey | null,
    revisitedEmotion: source.revisitedEmotion,
    originalOccurredAt: source.originalOccurredAt,
    revisitedAt: source.revisitedAt,
    sourceFollowUpId:
      typeof source.sourceFollowUpId === 'string'
        ? source.sourceFollowUpId.slice(0, 200)
        : undefined,
  };
};

const createCompanionConversation = (): Conversation => ({
  id: 'thread-revisit',
  title: '交流回访',
  preview: '',
  kind: 'companion',
  messages: [],
});

export const createEmptyAppData = (): AppDataSnapshot => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  dataMode: 'real',
  moments: [],
  notes: [],
  conversations: [createCompanionConversation()],
  followUps: [],
  revisits: [],
  starInboxItems: [],
  themeTone: 'original',
  themePalette: DEFAULT_THEME,
});

export const createDemoAppData = (): AppDataSnapshot => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  dataMode: 'demo',
  moments: structuredClone(INITIAL_MOMENTS),
  notes: structuredClone(INITIAL_NOTES),
  conversations: structuredClone(INITIAL_CONVERSATIONS),
  followUps: structuredClone(INITIAL_FOLLOW_UPS),
  revisits: [],
  starInboxItems: structuredClone(DEMO_INBOX_ITEMS),
  themeTone: 'original',
  themePalette: DEFAULT_THEME,
});

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
): { snapshot: AppDataSnapshot; issues: string[] } => {
  const issues: string[] = [];
  const source = asObject(value);
  if (!source) {
    return { snapshot: createEmptyAppData(), issues: ['root-invalid'] };
  }
  const sourceVersion =
    typeof source.schemaVersion === 'number' ? source.schemaVersion : 1;
  if (sourceVersion > CURRENT_SCHEMA_VERSION) {
    issues.push('schema-newer-than-client');
  }
  const moments = Array.isArray(source.moments)
    ? source.moments
        .map((item) => sanitizeMoment(item, issues))
        .filter((item): item is EmotionMoment => Boolean(item))
    : [];
  const notes = Array.isArray(source.notes)
    ? source.notes
        .map((item) => sanitizeNote(item, issues))
        .filter((item): item is EmotionNote => Boolean(item))
    : [];
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
    ) ?? createCompanionConversation();
  const normalizedConversations = [
    { ...companion, id: 'thread-revisit', kind: 'companion' as const },
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
  const followUps = Array.isArray(source.followUps)
    ? source.followUps
        .map((item) => sanitizeFollowUp(item, issues))
        .filter(
          (item): item is FollowUpRecord =>
            Boolean(item && noteIds.has(item.noteId)),
        )
    : [];
  const revisits = Array.isArray(source.revisits)
    ? source.revisits
        .map((item) => sanitizeRevisit(item, issues))
        .filter(
          (item): item is RevisitRecord =>
            Boolean(item && noteIds.has(item.noteId)),
        )
    : [];
  const starInboxItems = Array.isArray(source.starInboxItems)
    ? source.starInboxItems
        .map((item) => sanitizeStarInboxItem(item, issues))
        .filter((item): item is StarInboxItem => Boolean(item))
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
    ? protectThemePaletteContrast(source.themePalette)
    : DEFAULT_THEME;
  return {
    snapshot: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      dataMode,
      moments,
      notes,
      conversations: normalizedConversations,
      followUps,
      revisits,
      starInboxItems,
      themeTone,
      themePalette,
    },
    issues: Array.from(new Set(issues)),
  };
};

export const loadAppData = (): LoadedAppData => {
  try {
    const stored = window.localStorage.getItem(APP_DATA_STORAGE_KEY);
    if (!stored) return createDemoAppData();
    try {
      const { snapshot, issues } = migrateAppData(JSON.parse(stored));
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

export const saveAppData = (snapshot: AppDataSnapshot) => {
  try {
    window.localStorage.setItem(
      APP_DATA_STORAGE_KEY,
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
  | { ok: false; issue: AppDataLoadIssue } => {
  try {
    const parsed = JSON.parse(text);
    if (!asObject(parsed)) return { ok: false, issue: 'invalid-import' };
    const migrated = migrateAppData(parsed);
    return { ok: true, ...migrated };
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

export const clearAllLocalData = () => {
  const keys = [
    APP_DATA_STORAGE_KEY,
    'my-emotion-map.local-settings.v1',
    'my-emotion-map.map-style.v1',
    'my-emotion-map.health-preferences.v1',
    'my-emotion-map.connection-preferences.v1',
    'my-emotion-map.ai-avatar.v1',
    'my-emotion-map.shortcut-heart-dedupe.v1',
  ];
  try {
    keys.forEach((key) => window.localStorage.removeItem(key));
    return true;
  } catch {
    return false;
  }
};

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
    originalOccurredAt: new Date(
      `${note.date}T${note.time}:00`,
    ).toISOString(),
    revisitedAt,
    sourceFollowUpId,
  },
];

export const dismissInboxItem = (
  items: StarInboxItem[],
  itemId: string,
  seenAt = new Date().toISOString(),
): StarInboxItem[] =>
  items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          status: 'dismissed',
          seenAt: item.seenAt ?? seenAt,
        }
      : item,
  );

export const removeMomentAssociations = (
  snapshot: AppDataSnapshot,
  momentId: string,
): AppDataSnapshot => {
  const moment = snapshot.moments.find((item) => item.id === momentId);
  if (!moment) return snapshot;
  const remainingMoments = snapshot.moments
    .filter((item) => item.id !== momentId)
    .map((item) =>
      moment.tagGroupId !== undefined &&
      moment.tagOrder !== undefined &&
      item.tagGroupId === moment.tagGroupId &&
      item.tagOrder !== undefined &&
      item.tagOrder > moment.tagOrder
        ? { ...item, tagOrder: item.tagOrder - 1 }
        : item,
    );
  return {
    ...snapshot,
    moments: remainingMoments,
    notes: snapshot.notes.filter((note) => note.id !== moment.noteId),
    followUps: snapshot.followUps.filter(
      (record) => record.noteId !== moment.noteId,
    ),
    revisits: snapshot.revisits.filter(
      (record) => record.noteId !== moment.noteId,
    ),
    conversations: snapshot.conversations.map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) => ({
        ...message,
        noteIds: message.noteIds?.filter(
          (noteId) => noteId !== moment.noteId,
        ),
      })),
    })),
    starInboxItems: snapshot.starInboxItems.map((item) =>
      moment.id === `health-star-${item.id}`
        ? { ...item, status: 'dismissed' }
        : item,
    ),
  };
};
