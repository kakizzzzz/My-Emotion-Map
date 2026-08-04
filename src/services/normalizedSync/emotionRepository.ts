import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mapEmotionConversationRow,
  mapEmotionFollowUpRow,
  mapEmotionMessageRow,
  mapEmotionPreferencesRow,
  mapEmotionRecordRow,
  mapEmotionRevisitRow,
  mapEmotionSettingsRow,
  emotionRows,
  type EmotionRowChange,
  type EmotionSettingsRow,
} from './emotionRowMapping';
import { toEmotionWireMutation } from './emotionMutationModel';
import { NORMALIZED_EMOTION_MODEL_VERSION } from './emotionSyncTypes';
import type {
  EmotionConversationEntity,
  EmotionFollowUpEntity,
  EmotionMessageEntity,
  EmotionMutation,
  EmotionPreferencesEntity,
  EmotionRecordEntity,
  EmotionRevisitEntity,
  NormalizedEmotionSnapshot,
} from './emotionSyncTypes';
import {
  NormalizedEmotionSyncError,
  normalizeEmotionSyncError,
} from './emotionSyncErrors';

const PAGE_SIZE = 500;
const MAX_READ_ATTEMPTS = 3;

type QueryResult = { data: unknown; error: unknown };
type PageLoader = (from: number, to: number) => PromiseLike<QueryResult>;

export type NormalizedEmotionAccountData = {
  snapshot: NormalizedEmotionSnapshot;
  revision: number;
  dataModelVersion: number;
  migrationVerification: Record<string, unknown> | null;
};

export type EmotionChangeSet = {
  revision: number;
  settings?: NormalizedEmotionSnapshot['settings'];
  preferences?: EmotionPreferencesEntity;
  records: EmotionRowChange<EmotionRecordEntity>[];
  conversations: EmotionRowChange<EmotionConversationEntity>[];
  messages: EmotionRowChange<EmotionMessageEntity>[];
  followUps: EmotionRowChange<EmotionFollowUpEntity>[];
  revisits: EmotionRowChange<EmotionRevisitEntity>[];
};

const fail = (error: unknown): never => {
  throw normalizeEmotionSyncError(error);
};

const assertOwner = (rows: Record<string, unknown>[], userId: string) => {
  if (rows.some((row) => row.user_id !== userId)) {
    throw new NormalizedEmotionSyncError({
      kind: 'authorization',
      message: 'Normalized query returned a cross-account row.',
    });
  }
  return rows;
};

const loadPages = async (loadPage: PageLoader, userId: string) => {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) fail(error);
    const page = assertOwner(emotionRows(data), userId);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
};

const loadSettings = async (
  client: SupabaseClient,
  userId: string,
): Promise<EmotionSettingsRow> => {
  const { data, error } = await client
    .from('emotion_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) fail(error);
  if (!data) {
    throw new NormalizedEmotionSyncError({
      kind: 'setup_required',
      message: 'Normalized emotion storage is not initialized.',
    });
  }
  if ((data as Record<string, unknown>).user_id !== userId) {
    throw new NormalizedEmotionSyncError({
      kind: 'authorization',
      message: 'Emotion settings belong to another account.',
    });
  }
  const settings = mapEmotionSettingsRow(data);
  if (settings.dataModelVersion > NORMALIZED_EMOTION_MODEL_VERSION) {
    throw new NormalizedEmotionSyncError({
      kind: 'upgrade_required',
      message: 'Cloud data requires a newer normalized data model.',
    });
  }
  if (settings.dataModelVersion < NORMALIZED_EMOTION_MODEL_VERSION ||
    !settings.migrationVerifiedAt || settings.revision < 0) {
    throw new NormalizedEmotionSyncError({
      kind: 'setup_required',
      message: 'Normalized emotion storage migration is not verified.',
    });
  }
  return settings;
};

const loadPreferences = async (client: SupabaseClient, userId: string) => {
  const { data, error } = await client
    .from('emotion_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) fail(error);
  if (!data || (data as Record<string, unknown>).user_id !== userId) {
    throw new NormalizedEmotionSyncError({
      kind: 'setup_required',
      message: 'Normalized account preferences are missing.',
    });
  }
  return mapEmotionPreferencesRow(data);
};

const activePages = (
  client: SupabaseClient,
  table: string,
  userId: string,
  orders: string[],
) => loadPages((from, to) => {
  let query = client.from(table).select('*')
    .eq('user_id', userId).is('deleted_at', null);
  orders.forEach((column) => { query = query.order(column, { ascending: true }); });
  return query.range(from, to);
}, userId);

const changePages = (
  client: SupabaseClient,
  table: string,
  userId: string,
  sinceRevision: number,
  throughRevision: number,
  orders: string[],
) => loadPages((from, to) => {
  let query = client.from(table).select('*').eq('user_id', userId)
    .gt('changed_revision', sinceRevision)
    .lte('changed_revision', throughRevision);
  orders.forEach((column) => { query = query.order(column, { ascending: true }); });
  return query.range(from, to);
}, userId);

const fullReadAttempt = async (
  client: SupabaseClient,
  userId: string,
  before: EmotionSettingsRow,
) => {
  const [preferences, records, conversations, messages, followUps, revisits] =
    await Promise.all([
      loadPreferences(client, userId),
      activePages(client, 'emotion_records', userId, ['sort_order', 'moment_id']),
      activePages(client, 'emotion_conversations', userId, ['sort_order', 'id']),
      activePages(client, 'emotion_messages', userId, [
        'conversation_id', 'sort_order', 'id',
      ]),
      activePages(client, 'emotion_followups', userId, ['sort_order', 'id']),
      activePages(client, 'emotion_revisits', userId, ['sort_order', 'id']),
    ]);
  const after = await loadSettings(client, userId);
  if (before.revision !== after.revision) return null;
  return {
    revision: after.revision,
    dataModelVersion: after.dataModelVersion,
    migrationVerification: after.migrationVerification,
    snapshot: {
      settings: after.settings,
      preferences,
      records: records.map((row) => mapEmotionRecordRow(row).value),
      conversations: conversations.map((row) => mapEmotionConversationRow(row).value),
      messages: messages.map((row) => mapEmotionMessageRow(row).value),
      followUps: followUps.map((row) => mapEmotionFollowUpRow(row).value),
      revisits: revisits.map((row) => mapEmotionRevisitRow(row).value),
    },
  } satisfies NormalizedEmotionAccountData;
};

export const loadNormalizedEmotionAccountData = async (
  client: SupabaseClient,
  userId: string,
) => {
  for (let attempt = 0; attempt < MAX_READ_ATTEMPTS; attempt += 1) {
    const before = await loadSettings(client, userId);
    const result = await fullReadAttempt(client, userId, before);
    if (result) return result;
  }
  throw new NormalizedEmotionSyncError({
    kind: 'inconsistent_read',
    message: 'Cloud data changed during three consecutive full reads.',
  });
};

const incrementalAttempt = async (
  client: SupabaseClient,
  userId: string,
  sinceRevision: number,
  before: EmotionSettingsRow,
) => {
  if (before.revision === sinceRevision) return {
    revision: before.revision,
    records: [], conversations: [], messages: [], followUps: [], revisits: [],
  } satisfies EmotionChangeSet;
  const [preferencesRows, records, conversations, messages, followUps, revisits] =
    await Promise.all([
      changePages(client, 'emotion_preferences', userId, sinceRevision,
        before.revision, ['changed_revision']),
      changePages(client, 'emotion_records', userId, sinceRevision,
        before.revision, ['changed_revision', 'sort_order', 'moment_id']),
      changePages(client, 'emotion_conversations', userId, sinceRevision,
        before.revision, ['changed_revision', 'sort_order', 'id']),
      changePages(client, 'emotion_messages', userId, sinceRevision,
        before.revision, ['changed_revision', 'conversation_id', 'sort_order', 'id']),
      changePages(client, 'emotion_followups', userId, sinceRevision,
        before.revision, ['changed_revision', 'sort_order', 'id']),
      changePages(client, 'emotion_revisits', userId, sinceRevision,
        before.revision, ['changed_revision', 'sort_order', 'id']),
    ]);
  const after = await loadSettings(client, userId);
  if (before.revision !== after.revision) return null;
  return {
    revision: after.revision,
    ...(after.changedRevision > sinceRevision ? { settings: after.settings } : {}),
    ...(preferencesRows.at(-1)
      ? { preferences: mapEmotionPreferencesRow(preferencesRows.at(-1)) }
      : {}),
    records: records.map(mapEmotionRecordRow),
    conversations: conversations.map(mapEmotionConversationRow),
    messages: messages.map(mapEmotionMessageRow),
    followUps: followUps.map(mapEmotionFollowUpRow),
    revisits: revisits.map(mapEmotionRevisitRow),
  } satisfies EmotionChangeSet;
};

export const loadEmotionChangesSince = async (
  client: SupabaseClient,
  userId: string,
  revision: number,
) => {
  for (let attempt = 0; attempt < MAX_READ_ATTEMPTS; attempt += 1) {
    const before = await loadSettings(client, userId);
    if (before.revision < revision) {
      throw new NormalizedEmotionSyncError({
        kind: 'server',
        message: 'Cloud revision moved backwards.',
      });
    }
    const result = await incrementalAttempt(client, userId, revision, before);
    if (result) return result;
  }
  throw new NormalizedEmotionSyncError({
    kind: 'inconsistent_read',
    message: 'Cloud data changed during three consecutive incremental reads.',
  });
};

const mergeChanges = <T>(
  values: T[],
  changes: EmotionRowChange<T>[],
  key: (value: T) => string,
) => {
  const merged = new Map(values.map((value) => [key(value), value]));
  changes.forEach((item) => {
    const entityKey = key(item.value);
    if (item.deletedAt) merged.delete(entityKey);
    else merged.set(entityKey, item.value);
  });
  return [...merged.values()];
};

export const applyEmotionChanges = (
  source: NormalizedEmotionSnapshot,
  changes: EmotionChangeSet,
): NormalizedEmotionSnapshot => ({
  settings: changes.settings ?? source.settings,
  preferences: changes.preferences ?? source.preferences,
  records: mergeChanges(source.records, changes.records, (value) => value.momentId),
  conversations: mergeChanges(source.conversations, changes.conversations,
    (value) => value.id),
  messages: mergeChanges(source.messages, changes.messages,
    (value) => `${value.conversationId}/${value.id}`),
  followUps: mergeChanges(source.followUps, changes.followUps, (value) => value.id),
  revisits: mergeChanges(source.revisits, changes.revisits, (value) => value.id),
});

export const applyEmotionMutations = async (
  client: SupabaseClient,
  expectedRevision: number,
  mutations: EmotionMutation[],
) => {
  if (!mutations.length || mutations.length > PAGE_SIZE) {
    throw new NormalizedEmotionSyncError({
      kind: 'validation',
      message: 'Mutation batch must contain between 1 and 500 changes.',
    });
  }
  const { data, error } = await client.rpc('apply_emotion_mutations', {
    p_expected_revision: expectedRevision,
    p_mutations: mutations.map(toEmotionWireMutation),
  });
  if (error) fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  const value = row && typeof row === 'object' ? row as Record<string, unknown> : {};
  const revision = Number(value.dataset_revision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new NormalizedEmotionSyncError({
      kind: 'server',
      message: 'Mutation RPC returned an invalid revision.',
    });
  }
  return {
    saved: value.saved === true,
    revision,
    conflict: value.conflict && typeof value.conflict === 'object'
      ? value.conflict as Record<string, unknown>
      : null,
  };
};

export const purgeExpiredEmotionTrash = async (client: SupabaseClient) => {
  const { data, error } = await client.rpc('purge_expired_emotion_trash');
  if (error) fail(error);
  return data;
};
