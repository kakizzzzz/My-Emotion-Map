import { isThemePalette } from '../../app/themePreferences';
import { isEmotionPreferencesEntityValid } from '../../domain/storage/normalizedEmotionSnapshot';
import type {
  EmotionMutation,
  EmotionMutationType,
  EmotionPreferencesEntity,
} from './emotionSyncTypes';
import { isStoredNoteImage } from '../noteImageStorage';

const MUTATION_TYPES = new Set<EmotionMutationType>([
  'settings_update',
  'preferences_update',
  'record_upsert',
  'record_soft_delete',
  'conversation_upsert',
  'conversation_soft_delete',
  'message_upsert',
  'message_soft_delete',
  'followup_upsert',
  'followup_soft_delete',
  'revisit_upsert',
  'revisit_soft_delete',
]);
const EMOTIONS = new Set([
  'calm', 'joy', 'tender', 'curious', 'energized', 'connected',
  'heavy', 'restless', 'focused', 'overwhelmed', 'numb', 'mixed',
]);
const PLACE_RATINGS = new Set([
  'safe', 'comfortable', 'neutral', 'uneasy', 'distressing',
]);
const TERMINAL_FOLLOW_UPS = new Set(['answered', 'skipped']);
const SENSITIVE_KEYS = new Set([
  'password', 'loginpassword', 'registerpassword', 'currentpassword',
  'newpassword', 'confirmpassword', 'invitecode', 'accesstoken',
  'refreshtoken', 'servicerolekey', 'databaseurl', 'supabasekey',
  'mcptoken', 'mylifememorytoken', 'shortcutpairingsecret',
  'siliconflowkey', 'session', 'profileid',
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export class EmotionMutationValidationError extends Error {
  mutationType: string;
  entityId: string;

  constructor(message: string, mutation: EmotionMutation) {
    super(message);
    this.name = 'EmotionMutationValidationError';
    this.mutationType = mutation.type;
    this.entityId = mutation.entityId;
  }
}

const reject = (mutation: EmotionMutation, message: string): never => {
  throw new EmotionMutationValidationError(message, mutation);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isTimestamp = (value: unknown) => value === null || (
  typeof value === 'string' && value.length > 0 &&
  !Number.isNaN(new Date(value).getTime())
);

const isDate = (value: unknown) => {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 &&
    date.getDate() === day;
};

const hasSensitiveKeys = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasSensitiveKeys);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return SENSITIVE_KEYS.has(normalized) || hasSensitiveKeys(child);
  });
};

const validateRecord = (mutation: EmotionMutation, payload: Record<string, unknown>) => {
  if (typeof payload.momentId !== 'string' || payload.momentId !== mutation.entityId ||
    typeof payload.noteId !== 'string' || !payload.noteId ||
    typeof payload.sortOrder !== 'number' || payload.sortOrder < 0 ||
    typeof payload.latitude !== 'number' || !Number.isFinite(payload.latitude) ||
    payload.latitude < -90 || payload.latitude > 90 ||
    typeof payload.longitude !== 'number' || !Number.isFinite(payload.longitude) ||
    payload.longitude < -180 || payload.longitude > 180) {
    reject(mutation, 'A record has invalid identifiers, order, or coordinates.');
  }
  if (!(payload.emotion === null || EMOTIONS.has(String(payload.emotion)))) {
    reject(mutation, 'A record has an invalid emotion.');
  }
  if (!(payload.placeRating === null || PLACE_RATINGS.has(String(payload.placeRating)))) {
    reject(mutation, 'A record has an invalid place rating.');
  }
  if (typeof payload.intensity !== 'number' || !Number.isInteger(payload.intensity) ||
    payload.intensity < 0 || payload.intensity > 5 ||
    (payload.emotion === null && payload.intensity !== 0)) {
    reject(mutation, 'A record has an invalid emotion intensity.');
  }
  if (!(payload.color === null || (
    typeof payload.color === 'string' && HEX_COLOR.test(payload.color)
  ))) reject(mutation, 'A record has an invalid color.');
  if (!isDate(payload.localDate) || typeof payload.localTime !== 'string' ||
    !CLOCK_TIME.test(payload.localTime) || !isTimestamp(payload.occurredAtUtc)) {
    reject(mutation, 'A record has invalid canonical time fields.');
  }
  const answers = payload.answers;
  if (!Array.isArray(answers) || answers.length > 100) {
    reject(mutation, 'A record has invalid answers.');
  }
  for (const answer of answers as unknown[]) {
    if (!isRecord(answer) || typeof answer.id !== 'string' || !answer.id ||
      typeof answer.question !== 'string' || answer.question.length > 1_000 ||
      typeof answer.answer !== 'string' || answer.answer.length > 20_000) {
      reject(mutation, 'A record answer exceeds the current product limits.');
    }
  }
  if (String(payload.place ?? '').length > 500 ||
    String(payload.title ?? '').length > 500 ||
    String(payload.excerpt ?? '').length > 5_000) {
    reject(mutation, 'A record text field exceeds the current product limits.');
  }
  if (!(payload.image === null || isStoredNoteImage(payload.image))) {
    reject(mutation, 'A record has invalid image metadata.');
  }
};

const validateMessage = (mutation: EmotionMutation, payload: Record<string, unknown>) => {
  if (!mutation.parentId || payload.conversationId !== mutation.parentId ||
    payload.deliveryState === 'pending') {
    reject(mutation, 'A cloud message must have a conversation and cannot be pending.');
  }
  if ((payload.role !== 'user' && payload.role !== 'assistant') ||
    typeof payload.body !== 'string' || payload.body.length > 20_000 ||
    !Number.isInteger(payload.sortOrder) || Number(payload.sortOrder) < 0) {
    reject(mutation, 'A message exceeds the current product limits.');
  }
  if (payload.noteIds !== undefined && (
    !Array.isArray(payload.noteIds) || payload.noteIds.length > 20 ||
    payload.noteIds.some((value) => typeof value !== 'string')
  )) reject(mutation, 'A message has invalid note references.');
};

const validateFollowUp = (mutation: EmotionMutation, payload: Record<string, unknown>) => {
  if (typeof payload.noteId !== 'string' || !payload.noteId ||
    !Number.isSafeInteger(payload.intervalDays) || Number(payload.intervalDays) < 1 ||
    Number(payload.intervalDays) > 365 || !isTimestamp(payload.dueAt) ||
    !['queued', 'active', ...TERMINAL_FOLLOW_UPS].includes(String(payload.status))) {
    reject(mutation, 'A follow-up is invalid.');
  }
};

const validateRevisit = (mutation: EmotionMutation, payload: Record<string, unknown>) => {
  if (typeof payload.noteId !== 'string' || !payload.noteId ||
    !['lighter', 'stronger', 'different', 'same'].includes(String(payload.changeDirection)) ||
    !(payload.originalEmotion === null || EMOTIONS.has(String(payload.originalEmotion))) ||
    !(payload.currentEmotion === undefined || EMOTIONS.has(String(payload.currentEmotion))) ||
    !isTimestamp(payload.originalOccurredAt) || !isTimestamp(payload.revisitedAt)) {
    reject(mutation, 'A revisit is invalid.');
  }
};

export const validateEmotionMutation = (mutation: EmotionMutation) => {
  if (!mutation || !MUTATION_TYPES.has(mutation.type) ||
    typeof mutation.mutationId !== 'string' || !mutation.mutationId ||
    mutation.mutationId.length > 200 || typeof mutation.entityId !== 'string' ||
    !mutation.entityId || mutation.entityId.length > 200 ||
    (mutation.parentId?.length ?? 0) > 200) {
    reject(mutation, 'A mutation has an invalid type or identifier.');
  }
  if (mutation.type.endsWith('soft_delete')) return;
  if (!isRecord(mutation.payload)) reject(mutation, 'A mutation payload is required.');
  const payload = mutation.payload as Record<string, unknown>;
  if (hasSensitiveKeys(payload)) reject(mutation, 'Sensitive fields cannot enter emotion sync.');

  if (mutation.type === 'settings_update') {
    if (!Number.isInteger(payload.schemaVersion) || Number(payload.schemaVersion) < 1 ||
      !['original', 'terracotta', 'blue', 'mauve'].includes(String(payload.themeTone)) ||
      !isThemePalette(payload.themePalette)) {
      reject(mutation, 'Emotion settings are invalid.');
    }
  } else if (mutation.type === 'preferences_update') {
    if (!isEmotionPreferencesEntityValid(payload as EmotionPreferencesEntity)) {
      reject(mutation, 'Emotion preferences are invalid.');
    }
  } else if (mutation.type === 'record_upsert') {
    validateRecord(mutation, payload);
  } else if (mutation.type === 'conversation_upsert') {
    if (!Number.isInteger(payload.sortOrder) || Number(payload.sortOrder) < 0 ||
      (payload.kind !== 'regular' && payload.kind !== 'companion') ||
      typeof payload.title !== 'string' || payload.title.length > 500 ||
      'preview' in payload) {
      reject(mutation, 'A conversation is invalid or stores derived preview data.');
    }
  } else if (mutation.type === 'message_upsert') {
    validateMessage(mutation, payload);
  } else if (mutation.type === 'followup_upsert') {
    validateFollowUp(mutation, payload);
  } else if (mutation.type === 'revisit_upsert') {
    validateRevisit(mutation, payload);
  }
};

export const validateEmotionMutations = (mutations: EmotionMutation[]) => {
  mutations.forEach(validateEmotionMutation);
};

export const isTerminalFollowUpStatus = (value: unknown) =>
  TERMINAL_FOLLOW_UPS.has(String(value));
