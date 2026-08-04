type JsonObject = Record<string, unknown>;

const object = (value: unknown): JsonObject | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
const text = (value: unknown) => typeof value === 'string' ? value : '';
const nullableText = (value: unknown) => typeof value === 'string' ? value : null;
const optionalText = (value: unknown) =>
  typeof value === 'string' && value ? value : undefined;
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const integer = (value: unknown) => Number.isSafeInteger(Number(value))
  ? Number(value)
  : 0;
const array = (value: unknown) => Array.isArray(value) ? structuredClone(value) : [];

export const NORMALIZED_RECORD_SELECT = [
  'user_id', 'moment_id', 'note_id', 'sort_order', 'longitude', 'latitude',
  'place', 'emotion', 'intensity', 'place_rating', 'color', 'tag_group_id',
  'tag_order', 'local_date', 'local_time', 'occurred_at_utc', 'time_zone',
  'utc_offset_minutes', 'time_precision', 'event_time_source', 'source',
  'photo_taken_at', 'photo_taken_at_kind', 'photo_taken_at_source',
  'imported_at', 'location_captured_at', 'location_time_relation', 'title',
  'title_source', 'answers', 'excerpt', 'is_draft', 'is_new',
  'follow_up_enabled',
].join(',');

export const NORMALIZED_MESSAGE_SELECT = [
  'user_id', 'conversation_id', 'id', 'sort_order', 'role', 'body', 'kind',
  'note_ids', 'external_evidence', 'mcp_calls', 'options',
  'clarification_options', 'request_id', 'reply_to_request_id',
  'delivery_state', 'retryable', 'reference_confirmation', 'follow_up_id',
  'created_at',
].join(',');

export const normalizedEmotionRecordPair = (value: unknown) => {
  const row = object(value);
  if (!row) return null;
  const temporal = {
    occurredAtUtc: nullableText(row.occurred_at_utc),
    localDate: text(row.local_date),
    localTime: text(row.local_time),
    timeZone: nullableText(row.time_zone),
    utcOffsetMinutes: row.utc_offset_minutes == null
      ? null
      : integer(row.utc_offset_minutes),
    timePrecision: text(row.time_precision),
    eventTimeSource: text(row.event_time_source),
  };
  const color = optionalText(row.color);
  return {
    moment: {
      id: text(row.moment_id),
      noteId: text(row.note_id),
      emotion: nullableText(row.emotion),
      intensity: row.emotion == null ? 0 : integer(row.intensity),
      place: text(row.place),
      date: text(row.local_date),
      time: text(row.local_time),
      longitude: number(row.longitude),
      latitude: number(row.latitude),
      placeRating: nullableText(row.place_rating),
      ...(color ? { color } : {}),
      ...(row.tag_group_id == null ? {} : { tagGroupId: number(row.tag_group_id) }),
      ...(row.tag_order == null ? {} : { tagOrder: number(row.tag_order) }),
      ...(row.is_new === true ? { isNew: true } : {}),
      ...(optionalText(row.source) ? { source: optionalText(row.source) } : {}),
      ...(optionalText(row.photo_taken_at)
        ? { photoTakenAt: optionalText(row.photo_taken_at) }
        : {}),
      ...(optionalText(row.photo_taken_at_kind)
        ? { photoTakenAtKind: optionalText(row.photo_taken_at_kind) }
        : {}),
      ...(optionalText(row.photo_taken_at_source)
        ? { photoTakenAtSource: optionalText(row.photo_taken_at_source) }
        : {}),
      ...(optionalText(row.imported_at) ? { importedAt: optionalText(row.imported_at) } : {}),
      ...(optionalText(row.location_captured_at)
        ? { locationCapturedAt: optionalText(row.location_captured_at) }
        : {}),
      ...(optionalText(row.location_time_relation)
        ? { locationTimeRelation: optionalText(row.location_time_relation) }
        : {}),
      ...temporal,
    },
    note: {
      id: text(row.note_id),
      title: text(row.title),
      ...(optionalText(row.title_source)
        ? { titleSource: optionalText(row.title_source) }
        : {}),
      place: text(row.place),
      date: text(row.local_date),
      time: text(row.local_time),
      emotion: nullableText(row.emotion),
      ...(color ? { color } : {}),
      placeRating: nullableText(row.place_rating),
      answers: array(row.answers),
      excerpt: text(row.excerpt),
      ...(row.is_draft === true ? { isDraft: true } : {}),
      followUpEnabled: row.follow_up_enabled === true,
      ...temporal,
    },
  };
};

const normalizedMessage = (value: unknown) => {
  const row = object(value);
  if (!row) return null;
  return {
    id: text(row.id),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    body: text(row.body),
    kind: text(row.kind) || 'message',
    noteIds: array(row.note_ids),
    externalEvidence: array(row.external_evidence),
    mcpCalls: array(row.mcp_calls),
    options: array(row.options),
    clarificationOptions: array(row.clarification_options),
    ...(optionalText(row.request_id) ? { requestId: optionalText(row.request_id) } : {}),
    ...(optionalText(row.reply_to_request_id)
      ? { replyToRequestId: optionalText(row.reply_to_request_id) }
      : {}),
    ...(optionalText(row.delivery_state)
      ? { deliveryState: optionalText(row.delivery_state) }
      : {}),
    retryable: row.retryable === true,
    ...(object(row.reference_confirmation)
      ? { referenceConfirmation: object(row.reference_confirmation) }
      : {}),
    ...(optionalText(row.follow_up_id) ? { followUpId: optionalText(row.follow_up_id) } : {}),
    ...(optionalText(row.created_at) ? { createdAt: optionalText(row.created_at) } : {}),
    sortOrder: integer(row.sort_order),
  };
};

export const normalizedEmotionSnapshotFromRows = ({
  records,
  messages = [],
  conversationId = '',
}: {
  records: unknown[];
  messages?: unknown[];
  conversationId?: string;
}) => {
  const pairs = records.map(normalizedEmotionRecordPair).filter(Boolean) as Array<
    NonNullable<ReturnType<typeof normalizedEmotionRecordPair>>
  >;
  const recent = messages.map(normalizedMessage).filter(Boolean) as Array<
    NonNullable<ReturnType<typeof normalizedMessage>>
  >;
  recent.sort((left, right) => left.sortOrder - right.sortOrder ||
    left.id.localeCompare(right.id));
  return {
    schemaVersion: 6,
    dataMode: 'real',
    moments: pairs.map((pair) => pair.moment),
    notes: pairs.map((pair) => pair.note),
    conversations: conversationId ? [{
      id: conversationId,
      title: '',
      preview: recent.at(-1)?.body.slice(0, 1_000) ?? '',
      messages: recent.map(({ sortOrder: _sortOrder, ...message }) => message),
    }] : [],
    followUps: [],
    revisits: [],
  };
};
