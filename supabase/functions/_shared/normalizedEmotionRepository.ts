import {
  NORMALIZED_MESSAGE_SELECT,
  NORMALIZED_RECORD_SELECT,
  normalizedEmotionSnapshotFromRows,
} from './normalizedEmotionRecords.ts';

const PAGE_SIZE = 500;
const MAX_ATTEMPTS = 3;
const DATA_MODEL_VERSION = 2;

type JsonObject = Record<string, unknown>;

export type NormalizedEmotionAccess = {
  supabaseUrl: string;
  userId: string;
  authorization: string;
  apiKey: string;
};

const ownerRows = (value: unknown, userId: string) => {
  if (!Array.isArray(value)) return null;
  const rows = value.filter((row): row is JsonObject =>
    Boolean(row && typeof row === 'object' && !Array.isArray(row)),
  );
  return rows.every((row) => row.user_id === userId) ? rows : null;
};

const restRows = async (
  access: NormalizedEmotionAccess,
  table: string,
  params: Record<string, string>,
) => {
  const url = new URL(`/rest/v1/${table}`, access.supabaseUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: {
      authorization: access.authorization,
      apikey: access.apiKey,
    },
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  return ownerRows(await response.json().catch(() => null), access.userId);
};

export const loadNormalizedEmotionRevision = async (
  access: NormalizedEmotionAccess,
) => {
  const rows = await restRows(access, 'emotion_settings', {
    user_id: `eq.${access.userId}`,
    select: 'user_id,dataset_revision,data_model_version,migration_verified_at',
    limit: '1',
  });
  const row = rows?.[0];
  const revision = Number(row?.dataset_revision);
  return row && Number(row.data_model_version) === DATA_MODEL_VERSION &&
    typeof row.migration_verified_at === 'string' &&
    Number.isSafeInteger(revision) && revision >= 0
    ? revision
    : null;
};

const loadFormalRecords = async (
  access: NormalizedEmotionAccess,
  noteId = '',
) => {
  const rows: JsonObject[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await restRows(access, 'emotion_records', {
      user_id: `eq.${access.userId}`,
      deleted_at: 'is.null',
      is_draft: 'eq.false',
      is_new: 'eq.false',
      ...(noteId ? { note_id: `eq.${noteId}` } : {}),
      select: NORMALIZED_RECORD_SELECT,
      order: 'sort_order.asc,moment_id.asc',
      limit: String(noteId ? 1 : PAGE_SIZE),
      offset: String(offset),
    });
    if (!page) return null;
    rows.push(...page);
    if (noteId || page.length < PAGE_SIZE) return rows;
  }
};

const loadRecentConversationMessages = async (
  access: NormalizedEmotionAccess,
  conversationId: string,
) => {
  if (!conversationId) return [];
  return restRows(access, 'emotion_messages', {
    user_id: `eq.${access.userId}`,
    conversation_id: `eq.${conversationId}`,
    deleted_at: 'is.null',
    select: NORMALIZED_MESSAGE_SELECT,
    order: 'sort_order.desc,id.desc',
    limit: '8',
  });
};

const loadContext = async (
  access: NormalizedEmotionAccess,
  options: { conversationId?: string; targetNoteId?: string },
) => {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const before = await loadNormalizedEmotionRevision(access);
    if (before === null) return null;
    const [records, messages] = await Promise.all([
      loadFormalRecords(access, options.targetNoteId),
      loadRecentConversationMessages(access, options.conversationId ?? ''),
    ]);
    if (!records || !messages) return null;
    const after = await loadNormalizedEmotionRevision(access);
    if (after === before) {
      return {
        revision: after,
        snapshot: normalizedEmotionSnapshotFromRows({
          records,
          messages,
          conversationId: options.conversationId,
        }),
      };
    }
  }
  return null;
};

export const loadNormalizedEmotionReadContext = (
  access: NormalizedEmotionAccess,
  conversationId = '',
) => loadContext(access, { conversationId });

export const loadNormalizedEmotionActionContext = (
  access: NormalizedEmotionAccess,
  targetNoteId = '',
) => loadContext(access, { targetNoteId });
