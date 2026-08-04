import { DEFAULT_THEME, isThemePalette } from '../../app/themePreferences';
import { normalizeFollowUpCurve } from '../../domain/followUps';
import type {
  EmotionConversationEntity,
  EmotionFollowUpEntity,
  EmotionMessageEntity,
  EmotionPreferencesEntity,
  EmotionRecordEntity,
  EmotionRevisitEntity,
  EmotionSettingsEntity,
} from './emotionSyncTypes';
import { NORMALIZED_EMOTION_APP_SCHEMA_VERSION } from './emotionSyncTypes';

type Row = Record<string, unknown>;

export type EmotionSettingsRow = {
  settings: EmotionSettingsEntity;
  revision: number;
  changedRevision: number;
  dataModelVersion: number;
  migrationVerifiedAt: string | null;
  migrationVerification: Record<string, unknown> | null;
};

export type EmotionRowChange<T> = {
  value: T;
  changedRevision: number;
  deletedAt: string | null;
};

const object = (value: unknown): Row | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Row
    : null;
const text = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;
const optionalText = (value: unknown) =>
  typeof value === 'string' && value ? value : undefined;
const nullableText = (value: unknown) =>
  typeof value === 'string' ? value : null;
const integer = (value: unknown, fallback = 0) =>
  Number.isSafeInteger(Number(value)) ? Number(value) : fallback;
const number = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const bool = (value: unknown) => value === true;
const array = <T>(value: unknown) =>
  Array.isArray(value) ? structuredClone(value) as T[] : [];

export const emotionRows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.map(object).filter((item): item is Row => item !== null)
    : [];

export const mapEmotionSettingsRow = (value: unknown): EmotionSettingsRow => {
  const row = object(value);
  if (!row) throw new Error('Emotion settings row is missing.');
  const palette = isThemePalette(row.theme_palette)
    ? structuredClone(row.theme_palette)
    : structuredClone(DEFAULT_THEME);
  const verification = object(row.migration_verification);
  return {
    settings: {
      schemaVersion: NORMALIZED_EMOTION_APP_SCHEMA_VERSION,
      themeTone: row.theme_tone === 'terracotta' || row.theme_tone === 'blue' ||
        row.theme_tone === 'mauve' ? row.theme_tone : 'original',
      themePalette: palette,
    },
    revision: integer(row.dataset_revision, -1),
    changedRevision: integer(row.changed_revision, -1),
    dataModelVersion: integer(row.data_model_version, -1),
    migrationVerifiedAt: nullableText(row.migration_verified_at),
    migrationVerification: verification ? structuredClone(verification) : null,
  };
};

export const mapEmotionPreferencesRow = (
  value: unknown,
): EmotionPreferencesEntity => {
  const row = object(value);
  if (!row) throw new Error('Emotion preferences row is missing.');
  return {
    profileName: text(row.profile_name).slice(0, 80),
    aboutMe: text(row.about_me).slice(0, 2_000),
    aiUserPrompt: text(row.ai_user_prompt).slice(0, 500),
    aiContextMessageCount: integer(row.ai_context_message_count, 8),
    chatPreferenceTags: array<string>(row.chat_preference_tags),
    followUpIntervals: normalizeFollowUpCurve(row.follow_up_intervals),
  };
};

const change = <T>(row: Row, value: T): EmotionRowChange<T> => ({
  value,
  changedRevision: integer(row.changed_revision, -1),
  deletedAt: nullableText(row.deleted_at),
});

export const mapEmotionRecordRow = (row: Row): EmotionRowChange<EmotionRecordEntity> =>
  change(row, {
    momentId: text(row.moment_id),
    noteId: text(row.note_id),
    sortOrder: integer(row.sort_order),
    longitude: number(row.longitude),
    latitude: number(row.latitude),
    place: text(row.place),
    emotion: nullableText(row.emotion) as EmotionRecordEntity['emotion'],
    intensity: integer(row.intensity),
    placeRating: nullableText(row.place_rating) as EmotionRecordEntity['placeRating'],
    color: nullableText(row.color),
    tagGroupId: row.tag_group_id == null ? null : number(row.tag_group_id),
    tagOrder: row.tag_order == null ? null : number(row.tag_order),
    localDate: text(row.local_date),
    localTime: text(row.local_time),
    occurredAtUtc: nullableText(row.occurred_at_utc),
    timeZone: nullableText(row.time_zone),
    utcOffsetMinutes: row.utc_offset_minutes == null
      ? null
      : integer(row.utc_offset_minutes),
    timePrecision: text(row.time_precision) as EmotionRecordEntity['timePrecision'],
    eventTimeSource: text(row.event_time_source) as EmotionRecordEntity['eventTimeSource'],
    source: nullableText(row.source) as EmotionRecordEntity['source'],
    photoTakenAt: nullableText(row.photo_taken_at),
    photoTakenAtKind: nullableText(row.photo_taken_at_kind) as EmotionRecordEntity['photoTakenAtKind'],
    photoTakenAtSource: nullableText(row.photo_taken_at_source) as EmotionRecordEntity['photoTakenAtSource'],
    importedAt: nullableText(row.imported_at),
    locationCapturedAt: nullableText(row.location_captured_at),
    locationTimeRelation: nullableText(row.location_time_relation) as EmotionRecordEntity['locationTimeRelation'],
    title: text(row.title),
    titleSource: nullableText(row.title_source) as EmotionRecordEntity['titleSource'],
    answers: array<EmotionRecordEntity['answers'][number]>(row.answers),
    excerpt: text(row.excerpt),
    isDraft: bool(row.is_draft),
    isNew: bool(row.is_new),
    followUpEnabled: bool(row.follow_up_enabled),
  });

export const mapEmotionConversationRow = (
  row: Row,
): EmotionRowChange<EmotionConversationEntity> => change(row, {
  id: text(row.id),
  sortOrder: integer(row.sort_order),
  title: text(row.title),
  badge: optionalText(row.badge),
  unread: bool(row.unread),
  proactive: bool(row.proactive),
  kind: row.kind === 'companion' ? 'companion' : 'regular',
});

export const mapEmotionMessageRow = (
  row: Row,
): EmotionRowChange<EmotionMessageEntity> => change(row, {
  conversationId: text(row.conversation_id),
  id: text(row.id),
  sortOrder: integer(row.sort_order),
  role: row.role === 'assistant' ? 'assistant' : 'user',
  body: text(row.body),
  kind: text(row.kind, 'message') as EmotionMessageEntity['kind'],
  noteIds: array<string>(row.note_ids),
  externalEvidence: array<NonNullable<EmotionMessageEntity['externalEvidence']>[number]>(
    row.external_evidence,
  ),
  mcpCalls: array<NonNullable<EmotionMessageEntity['mcpCalls']>[number]>(row.mcp_calls),
  options: array<NonNullable<EmotionMessageEntity['options']>[number]>(row.options),
  clarificationOptions: array<NonNullable<EmotionMessageEntity['clarificationOptions']>[number]>(
    row.clarification_options,
  ),
  requestId: optionalText(row.request_id),
  replyToRequestId: optionalText(row.reply_to_request_id),
  deliveryState: optionalText(row.delivery_state) as EmotionMessageEntity['deliveryState'],
  retryable: bool(row.retryable),
  referenceConfirmation: (object(row.reference_confirmation) ?? undefined) as
    EmotionMessageEntity['referenceConfirmation'],
  followUpId: optionalText(row.follow_up_id),
  createdAt: optionalText(row.created_at),
});

export const mapEmotionFollowUpRow = (
  row: Row,
): EmotionRowChange<EmotionFollowUpEntity> => change(row, {
  id: text(row.id),
  noteId: text(row.note_id),
  sortOrder: integer(row.sort_order),
  intervalDays: integer(row.interval_days),
  dueAt: text(row.due_at),
  status: text(row.status) as EmotionFollowUpEntity['status'],
  followUpConsentedAt: optionalText(row.follow_up_consented_at),
  promptVersion: row.prompt_version == null ? undefined : integer(row.prompt_version),
  prompt: optionalText(row.prompt),
  promptedAt: optionalText(row.prompted_at),
  responseOptionId: optionalText(row.response_option_id) as
    EmotionFollowUpEntity['responseOptionId'],
  answerCommandId: optionalText(row.answer_command_id),
  response: optionalText(row.response),
  responseKind: optionalText(row.response_kind) as EmotionFollowUpEntity['responseKind'],
  answeredVia: optionalText(row.answered_via) as EmotionFollowUpEntity['answeredVia'],
  answeredAt: optionalText(row.answered_at),
  assistantReply: optionalText(row.assistant_reply),
  seenAt: optionalText(row.seen_at),
});

export const mapEmotionRevisitRow = (
  row: Row,
): EmotionRowChange<EmotionRevisitEntity> => change(row, {
  id: text(row.id),
  noteId: text(row.note_id),
  sortOrder: integer(row.sort_order),
  originalEmotion: nullableText(row.original_emotion) as
    EmotionRevisitEntity['originalEmotion'],
  changeDirection: text(row.change_direction) as EmotionRevisitEntity['changeDirection'],
  currentEmotion: optionalText(row.current_emotion) as EmotionRevisitEntity['currentEmotion'],
  originalOccurredAt: text(row.original_occurred_at),
  revisitedAt: text(row.revisited_at),
  sourceFollowUpId: optionalText(row.source_follow_up_id),
});
