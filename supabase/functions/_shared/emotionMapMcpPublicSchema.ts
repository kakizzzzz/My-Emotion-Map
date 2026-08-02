export const MCP_DATE_SCHEMA = {
  type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$',
} as const;

export const MCP_LIMITATIONS_SCHEMA = {
  type: 'array', maxItems: 8,
  items: { type: 'string', maxLength: 160 },
} as const;

export const EMOTION_PUBLIC_RECORD_SCHEMA = {
  type: 'object',
  properties: {
    referenceId: { type: 'string', minLength: 1, maxLength: 200 },
    title: { type: 'string', maxLength: 200 },
    place: { type: 'string', maxLength: 160 },
    date: MCP_DATE_SCHEMA,
    time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
    emotion: { type: ['string', 'null'], maxLength: 40 },
    excerpt: { type: 'string', maxLength: 600 },
    matchReason: { type: 'string', maxLength: 80 },
  },
  required: [
    'referenceId', 'title', 'place', 'date', 'time', 'emotion', 'excerpt',
    'matchReason',
  ],
  additionalProperties: false,
} as const;

export const EMOTION_RECORD_LIST_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    status: { enum: ['supported', 'not_found'] },
    count: { type: 'integer', minimum: 0 },
    records: { type: 'array', maxItems: 50, items: EMOTION_PUBLIC_RECORD_SCHEMA },
    limitations: MCP_LIMITATIONS_SCHEMA,
  },
  required: ['status', 'count', 'records', 'limitations'],
  additionalProperties: false,
} as const;

export const MCP_RANGE_PROPERTIES = {
  startDate: MCP_DATE_SCHEMA,
  endDate: MCP_DATE_SCHEMA,
} as const;
