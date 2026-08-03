import type { AppLanguage } from '../i18n';
import type { ClarificationOption, McpCallReference } from '../types';
import { sanitizeMcpCalls } from '../domain/query/mcpCalls';
import type { CloudAuth } from './supabaseClient';

export type PublicEvidence = {
  noteId: string;
  title: string;
  date: string;
  place: string;
  matchReason: string;
};

export type ExternalPublicEvidence = {
  referenceId: string;
  title: string;
  date: string;
  place: string;
  matchReason: string;
  source: 'my_life_memory_external';
};

export type EmotionChatResult = {
  requestId?: string;
  serverRevision?: number;
  intent: 'lookup' | 'comparison' | 'pattern' | 'reflection' | 'count_stats' | 'recent_records' | 'recent_places' | 'casual' | 'clarification_required' | 'unsupported';
  retrievalStatus: 'supported' | 'ambiguous' | 'not_found' | 'evidence_insufficient' | 'clarification_required' | 'unsupported' | 'unavailable';
  status: 'supported' | 'ambiguous' | 'not_found' | 'evidence_insufficient' | 'clarification_required' | 'unsupported' | 'generation_rejected' | 'unavailable';
  answer: string;
  evidence: PublicEvidence[];
  externalEvidence: ExternalPublicEvidence[];
  mcpCalls: McpCallReference[];
  confidence: 'none' | 'low' | 'medium' | 'high';
  limitations: string[];
  clarificationOptions?: ClarificationOption[];
};

export type EmotionChatPlan = {
  requestId: string;
  serverRevision: number;
  source: 'emotion_map_local' | 'my_life_memory' | 'both' | 'unsupported';
  tools: Array<
    | 'research_memory_context'
    | 'search_memories'
    | 'list_locations'
    | 'get_location_memory'
    | 'get_day_memory'
    | 'summarize_memory_range'
    | 'get_memory_images'
    | 'get_routes'
  >;
  maxCalls: 0 | 1 | 2;
  routingPlanToken: string;
};

export class EmotionChatRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'EmotionChatRequestError';
  }
}

const waitForRetry = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });

const validateResult = (
  value: unknown,
  expectedRequestId?: string,
  expectedRevision?: number,
): EmotionChatResult | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const retrievalStatuses = new Set(['supported', 'ambiguous', 'not_found', 'evidence_insufficient', 'clarification_required', 'unsupported', 'unavailable']);
  const responseStatuses = new Set([...retrievalStatuses, 'generation_rejected']);
  const intents = new Set(['lookup', 'comparison', 'pattern', 'reflection', 'count_stats', 'recent_records', 'recent_places', 'casual', 'clarification_required', 'unsupported']);
  if (expectedRequestId && source.requestId !== expectedRequestId) return null;
  if (expectedRevision !== undefined && source.serverRevision !== expectedRevision) return null;
  if (!responseStatuses.has(String(source.status)) || !retrievalStatuses.has(String(source.retrievalStatus)) || !intents.has(String(source.intent))) return null;
  if (source.status === 'generation_rejected' && source.retrievalStatus !== 'supported') return null;
  if (typeof source.answer !== 'string' || source.answer.length > 4_000 || !Array.isArray(source.evidence) || !Array.isArray(source.limitations)) return null;
  const evidence: PublicEvidence[] = [];
  for (const raw of source.evidence.slice(0, 6)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    if (!['noteId', 'title', 'date', 'place', 'matchReason'].every((key) => typeof item[key] === 'string')) return null;
    evidence.push({
      noteId: (item.noteId as string).slice(0, 200),
      title: (item.title as string).slice(0, 200),
      date: (item.date as string).slice(0, 10),
      place: (item.place as string).slice(0, 160),
      matchReason: (item.matchReason as string).slice(0, 80),
    });
  }
  const externalEvidence: ExternalPublicEvidence[] = [];
  if (source.externalEvidence !== undefined && !Array.isArray(source.externalEvidence)) return null;
  for (const raw of (source.externalEvidence as unknown[] | undefined ?? []).slice(0, 6)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    if (!['referenceId', 'title', 'date', 'place', 'matchReason'].every(
      (key) => typeof item[key] === 'string',
    ) || item.source !== 'my_life_memory_external') return null;
    externalEvidence.push({
      referenceId: (item.referenceId as string).slice(0, 200),
      title: (item.title as string).slice(0, 200),
      date: (item.date as string).slice(0, 10),
      place: (item.place as string).slice(0, 160),
      matchReason: (item.matchReason as string).slice(0, 80),
      source: 'my_life_memory_external',
    });
  }
  if (source.mcpCalls !== undefined && !Array.isArray(source.mcpCalls)) return null;
  const rawMcpCalls = (source.mcpCalls as unknown[] | undefined ?? []).slice(0, 2);
  const mcpCalls = sanitizeMcpCalls(rawMcpCalls) ?? [];
  if (mcpCalls.length !== rawMcpCalls.length) return null;
  const confidence = source.confidence === 'high' || source.confidence === 'medium' || source.confidence === 'low' ? source.confidence : 'none';
  return {
    requestId: typeof source.requestId === 'string' ? source.requestId : undefined,
    serverRevision: typeof source.serverRevision === 'number'
      ? source.serverRevision
      : undefined,
    intent: source.intent as EmotionChatResult['intent'],
    retrievalStatus: source.retrievalStatus as EmotionChatResult['retrievalStatus'],
    status: source.status as EmotionChatResult['status'],
    answer: source.answer,
    evidence,
    externalEvidence,
    mcpCalls,
    confidence,
    limitations: source.limitations.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 300)).slice(0, 5),
    clarificationOptions: Array.isArray(source.clarificationOptions)
      ? source.clarificationOptions.flatMap((raw) => {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
          const item = raw as Record<string, unknown>;
          if (
            typeof item.optionId !== 'string' ||
            typeof item.label !== 'string' ||
            typeof item.continuationToken !== 'string'
          ) return [];
          return [{
            optionId: item.optionId.slice(0, 200),
            label: item.label.slice(0, 100),
            continuationToken: item.continuationToken.slice(0, 2_000),
          }];
        }).slice(0, 3)
      : undefined,
  };
};

const validatePlan = (
  value: unknown,
  expectedRequestId: string,
  expectedRevision: number,
): EmotionChatPlan | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const sources = new Set([
    'emotion_map_local', 'my_life_memory', 'both', 'unsupported',
  ]);
  const allowedTools = new Set([
    'research_memory_context', 'search_memories', 'list_locations',
    'get_location_memory', 'get_day_memory', 'summarize_memory_range',
    'get_memory_images', 'get_routes',
  ]);
  if (
    body.status !== 'planned' ||
    body.requestId !== expectedRequestId ||
    body.serverRevision !== expectedRevision ||
    !sources.has(String(body.source)) ||
    !Array.isArray(body.tools) || body.tools.length > 2 ||
    body.tools.some((tool) => !allowedTools.has(String(tool))) ||
    (body.maxCalls !== 0 && body.maxCalls !== 1 && body.maxCalls !== 2) ||
    body.maxCalls !== body.tools.length ||
    typeof body.routingPlanToken !== 'string' ||
    !body.routingPlanToken || body.routingPlanToken.length > 4_000
  ) return null;
  const external = body.source === 'my_life_memory' || body.source === 'both';
  if (external !== (body.tools.length > 0)) return null;
  return {
    requestId: body.requestId,
    serverRevision: body.serverRevision,
    source: body.source as EmotionChatPlan['source'],
    tools: body.tools as EmotionChatPlan['tools'],
    maxCalls: body.maxCalls,
    routingPlanToken: body.routingPlanToken,
  };
};

const postEmotionChat = (
  auth: CloudAuth,
  body: string,
  signal: AbortSignal,
) => fetch(`${auth.supabaseUrl}/functions/v1/emotion-chat`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${auth.accessToken}`,
    apikey: auth.publishableKey,
    'content-type': 'application/json',
  },
  body,
  signal,
});

export const requestEmotionChatPlan = async ({
  auth,
  requestId,
  message,
  language,
  conversationId,
  recentMessages,
  clientRevision,
  signal,
}: {
  auth: CloudAuth;
  requestId: string;
  message: string;
  language: AppLanguage;
  conversationId: string;
  recentMessages: Array<{ role: 'user' | 'assistant'; body: string }>;
  clientRevision: number;
  signal: AbortSignal;
}) => {
  const body = JSON.stringify({
    operation: 'plan',
    requestId,
    message,
    language,
    conversationId,
    recentMessages: recentMessages.slice(-20).map((item) => ({
      role: item.role,
      body: item.body.trim().slice(0, 400),
    })).filter((item) => item.body),
    clientRevision,
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await postEmotionChat(auth, body, signal);
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.ok) {
      const plan = validatePlan(payload, requestId, clientRevision);
      if (plan) return plan;
      throw new EmotionChatRequestError('invalid_plan_response', response.status);
    }
    const code = typeof payload?.code === 'string' ? payload.code : 'request_failed';
    if (response.status === 409 && code === 'request_in_progress' && attempt < 3) {
      await waitForRetry(350 * (attempt + 1), signal);
      continue;
    }
    throw new EmotionChatRequestError(code, response.status);
  }
  throw new EmotionChatRequestError('request_in_progress', 409);
};

export const requestEmotionChat = async ({
  auth,
  requestId,
  message,
  language,
  conversationId,
  explicitNoteIds = [],
  conversationAnchorNoteIds,
  stylePrompt = '',
  recentMessages = [],
  clientRevision,
  routingPlanToken,
  referenceConfirmation,
  signal,
}: {
  auth: CloudAuth;
  requestId: string;
  message: string;
  language: AppLanguage;
  conversationId: string;
  explicitNoteIds?: string[];
  conversationAnchorNoteIds: string[];
  stylePrompt?: string;
  recentMessages?: Array<{ role: 'user' | 'assistant'; body: string }>;
  clientRevision: number;
  routingPlanToken?: string;
  referenceConfirmation?: {
    optionId: string;
    continuationToken: string;
  };
  signal: AbortSignal;
}) => {
  const requestPayload = {
    requestId,
    message,
    language,
    conversationId,
    explicitNoteIds: explicitNoteIds.slice(0, 6),
    conversationAnchorNoteIds: conversationAnchorNoteIds.slice(0, 6),
    stylePrompt: stylePrompt.trim().slice(0, 500),
    recentMessages: recentMessages.slice(-20).map((item) => ({
      role: item.role,
      body: item.body.trim().slice(0, 400),
    })).filter((item) => item.body),
    clientRevision,
    routingPlanToken,
    referenceConfirmation,
  };
  let body = JSON.stringify(requestPayload);
  let retriedWithLegacyPayload = false;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await postEmotionChat(auth, body, signal);
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.ok) {
      const result = validateResult(payload, requestId, clientRevision);
      if (result) return result;
      throw new EmotionChatRequestError('invalid_response', response.status);
    }
    const code = typeof payload?.code === 'string' ? payload.code : 'request_failed';
    if (
      response.status === 400 &&
      code === 'invalid_request' &&
      (
        requestPayload.recentMessages.length > 0 ||
        Boolean(requestPayload.stylePrompt) ||
        Boolean(requestPayload.routingPlanToken)
      ) &&
      !retriedWithLegacyPayload
    ) {
      retriedWithLegacyPayload = true;
      const {
        recentMessages: _recentMessages,
        stylePrompt: _stylePrompt,
        routingPlanToken: _routingPlanToken,
        ...legacyPayload
      } = requestPayload;
      body = JSON.stringify(legacyPayload);
      continue;
    }
    if (
      response.status === 409 &&
      code === 'request_in_progress' &&
      attempt < 4
    ) {
      await waitForRetry(600 * (attempt + 1), signal);
      continue;
    }
    throw new EmotionChatRequestError(code, response.status);
  }
  throw new EmotionChatRequestError('request_in_progress', 409);
};
