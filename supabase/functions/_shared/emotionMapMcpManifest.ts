import {
  EMOTION_PUBLIC_RECORD_SCHEMA as publicRecord,
  EMOTION_RECORD_LIST_OUTPUT_SCHEMA as recordListOutput,
  MCP_DATE_SCHEMA as date,
  MCP_LIMITATIONS_SCHEMA as limitations,
  MCP_RANGE_PROPERTIES as rangeProperties,
} from './emotionMapMcpPublicSchema.ts';

export type EmotionMapMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown> & { additionalProperties: false };
  outputSchema: Record<string, unknown> & { additionalProperties: false };
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: false;
  };
};

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const actionAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const readTool = (
  name: string,
  title: string,
  description: string,
  inputSchema: EmotionMapMcpTool['inputSchema'],
  outputSchema: EmotionMapMcpTool['outputSchema'],
): EmotionMapMcpTool => ({
  name, title, description, inputSchema, outputSchema,
  annotations: readAnnotations,
});

export const EMOTION_MAP_READ_TOOLS: EmotionMapMcpTool[] = [
  readTool(
    'research_emotion_context',
    'Research saved emotion context',
    'Retrieve bounded owner-authorized evidence with ambiguity and limitations.',
    {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 1_200 },
        limit: { type: 'integer', minimum: 1, maximum: 6 },
        continuationToken: { type: 'string', minLength: 20, maxLength: 4_096 },
        optionId: { type: 'string', minLength: 1, maxLength: 120 },
      },
      required: ['query'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        status: { enum: ['supported', 'ambiguous', 'not_found', 'evidence_insufficient'] },
        retrievalStatus: { enum: ['supported', 'ambiguous', 'not_found', 'evidence_insufficient'] },
        records: { type: 'array', maxItems: 6, items: publicRecord },
        aggregates: {
          type: 'object',
          properties: {
            totalAuthorized: { type: 'integer', minimum: 0 },
            totalMatching: { type: 'integer', minimum: 0 },
            dateCount: { type: 'integer', minimum: 0 },
            placeCount: { type: 'integer', minimum: 0 },
          },
          required: ['totalAuthorized', 'totalMatching', 'dateCount', 'placeCount'],
          additionalProperties: false,
        },
        limitations,
        options: {
          type: 'array', maxItems: 6,
          items: {
            type: 'object',
            properties: {
              optionId: { type: 'string', minLength: 1, maxLength: 120 },
              title: { type: 'string', maxLength: 200 },
              place: { type: 'string', maxLength: 160 },
              date,
            },
            required: ['optionId', 'title', 'place', 'date'],
            additionalProperties: false,
          },
        },
        continuationToken: { type: ['string', 'null'], maxLength: 4_096 },
      },
      required: [
        'status', 'retrievalStatus', 'records', 'aggregates', 'limitations',
        'options', 'continuationToken',
      ],
      additionalProperties: false,
    },
  ),
  readTool(
    'search_emotion_records',
    'Search saved emotion records',
    'Search formal owner records with bounded filters.',
    {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 300 },
        ...rangeProperties,
        place: { type: 'string', minLength: 1, maxLength: 160 },
        emotion: { type: 'string', minLength: 1, maxLength: 40 },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
    recordListOutput,
  ),
  readTool(
    'list_emotion_locations',
    'List saved locations',
    'List owner-entered place labels and deterministic counts without coordinates.',
    {
      type: 'object',
      properties: { ...rangeProperties, limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        status: { enum: ['supported', 'not_found'] },
        count: { type: 'integer', minimum: 0 },
        locations: {
          type: 'array', maxItems: 50,
          items: {
            type: 'object',
            properties: {
              place: { type: 'string', minLength: 1, maxLength: 160 },
              count: { type: 'integer', minimum: 1 },
            },
            required: ['place', 'count'],
            additionalProperties: false,
          },
        },
        limitations,
      },
      required: ['status', 'count', 'locations', 'limitations'],
      additionalProperties: false,
    },
  ),
  readTool(
    'get_location_emotion_context',
    'Get location context',
    'Return formal records for one explicit owner-entered place label.',
    {
      type: 'object',
      properties: {
        place: { type: 'string', minLength: 1, maxLength: 160 },
        ...rangeProperties,
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      required: ['place'],
      additionalProperties: false,
    },
    recordListOutput,
  ),
  readTool(
    'get_day_emotion_context',
    'Get day context',
    'Return formal records saved on one local date.',
    {
      type: 'object',
      properties: { date, limit: { type: 'integer', minimum: 1, maximum: 20 } },
      required: ['date'],
      additionalProperties: false,
    },
    recordListOutput,
  ),
  readTool(
    'summarize_emotion_range',
    'Summarize an emotion range',
    'Return deterministic counts over the complete authorized date range.',
    {
      type: 'object',
      properties: {
        startDate: date,
        endDate: date,
        groupBy: { enum: ['date', 'place', 'emotion'] },
      },
      required: ['startDate', 'endDate', 'groupBy'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        status: { enum: ['supported', 'not_found'] },
        count: { type: 'integer', minimum: 0 },
        range: {
          type: 'object', properties: rangeProperties,
          required: ['startDate', 'endDate'], additionalProperties: false,
        },
        groups: {
          type: 'array', maxItems: 100,
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', maxLength: 160 },
              count: { type: 'integer', minimum: 1 },
            },
            required: ['key', 'count'], additionalProperties: false,
          },
        },
        limitations,
      },
      required: ['status', 'count', 'range', 'groups', 'limitations'],
      additionalProperties: false,
    },
  ),
  readTool(
    'export_emotion_report',
    'Export emotion report',
    'Return a bounded JSON report of formal owner records.',
    {
      type: 'object',
      properties: {
        ...rangeProperties,
        format: { enum: ['json'] },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        status: { enum: ['supported', 'not_found'] },
        count: { type: 'integer', minimum: 0, maximum: 50 },
        format: { enum: ['json'] },
        generatedAt: { type: 'string', maxLength: 40 },
        records: { type: 'array', maxItems: 50, items: publicRecord },
        limitations,
      },
      required: ['status', 'count', 'format', 'generatedAt', 'records', 'limitations'],
      additionalProperties: false,
    },
  ),
];

const actionTool = (
  name: string,
  title: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): EmotionMapMcpTool => ({
  name, title, description,
  inputSchema: { type: 'object', properties, required, additionalProperties: false },
  outputSchema: {
    type: 'object',
    properties: {
      status: { enum: ['queued'] },
      proposalId: { type: 'string', minLength: 1, maxLength: 200 },
      requiresUserConfirmation: { type: 'boolean' },
    },
    required: ['status', 'proposalId', 'requiresUserConfirmation'],
    additionalProperties: false,
  },
  annotations: actionAnnotations,
});

const clientRequestId = { type: 'string', minLength: 1, maxLength: 120 };
const noteId = { type: 'string', minLength: 1, maxLength: 200 };

export const EMOTION_MAP_ACTION_TOOLS: EmotionMapMcpTool[] = [
  actionTool('propose_create_draft', 'Propose a draft', 'Queue a draft for explicit in-app confirmation.', {
    clientRequestId,
    title: { type: 'string', maxLength: 200 },
    localDate: date,
    localTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
    place: { type: 'string', maxLength: 160 },
    text: { type: 'string', maxLength: 2_000 },
    emotion: { type: 'string', maxLength: 40 },
  }, ['clientRequestId']),
  actionTool('propose_append_note', 'Propose a note append', 'Queue text to append after explicit in-app confirmation.', {
    clientRequestId, noteId, text: { type: 'string', minLength: 1, maxLength: 2_000 },
  }, ['clientRequestId', 'noteId', 'text']),
  actionTool('propose_schedule_followup', 'Propose a follow-up', 'Queue a bounded follow-up after explicit in-app confirmation.', {
    clientRequestId, noteId, intervalDays: { enum: [1, 3, 7] },
  }, ['clientRequestId', 'noteId', 'intervalDays']),
];

export const listEmotionMapReadTools = (scopes: readonly string[]) =>
  scopes.includes('records:read') ? EMOTION_MAP_READ_TOOLS : [];
