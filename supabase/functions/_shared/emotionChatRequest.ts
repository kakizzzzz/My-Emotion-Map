import type { ChatLanguage } from './chatGrounding.ts';

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export const validateEmotionChatRequest = (value: unknown) => {
  const body = asObject(value);
  if (!body) return null;
  const allowed = new Set([
    'requestId', 'message', 'language', 'conversationId', 'explicitNoteIds',
    'conversationAnchorNoteIds',
    'clientRevision', 'stylePrompt',
    'recentMessages', 'referenceConfirmation',
    'routingPlanToken',
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return null;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  if (body.language !== 'zh' && body.language !== 'en' && body.language !== 'ko') return null;
  const language: ChatLanguage = body.language;
  const conversationId = typeof body.conversationId === 'string'
    ? body.conversationId.trim()
    : '';
  const boundedNoteIds = (value: unknown) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 6 || value.some((item) =>
      typeof item !== 'string' || !item || item.length > 200)) return null;
    return [...new Set(value)] as string[];
  };
  const explicitNoteIds = boundedNoteIds(body.explicitNoteIds);
  const conversationAnchorNoteIds = boundedNoteIds(
    body.conversationAnchorNoteIds,
  );
  if (!explicitNoteIds || !conversationAnchorNoteIds) return null;
  if (body.stylePrompt !== undefined && typeof body.stylePrompt !== 'string') return null;
  const stylePrompt = typeof body.stylePrompt === 'string'
    ? body.stylePrompt.trim().slice(0, 500)
    : '';
  const recentMessages = Array.isArray(body.recentMessages)
    ? body.recentMessages.flatMap((raw) => {
        const item = asObject(raw);
        if (!item || (item.role !== 'user' && item.role !== 'assistant') ||
          typeof item.body !== 'string') return [];
        const message = item.body.trim().slice(0, 400);
        return message ? [{
          role: item.role as 'user' | 'assistant',
          body: message,
        }] : [];
      }).slice(-20)
    : [];
  if (body.recentMessages !== undefined && !Array.isArray(body.recentMessages)) return null;
  const clientRevision = typeof body.clientRevision === 'number' &&
    Number.isSafeInteger(body.clientRevision) && body.clientRevision >= 0
    ? body.clientRevision
    : null;
  const reference = asObject(body.referenceConfirmation);
  if (reference && Object.keys(reference).some((key) =>
    key !== 'optionId' && key !== 'continuationToken')) return null;
  const referenceConfirmation = reference
    ? {
        optionId: typeof reference.optionId === 'string'
          ? reference.optionId.trim().slice(0, 200)
          : '',
        continuationToken: typeof reference.continuationToken === 'string'
          ? reference.continuationToken.trim().slice(0, 4_000)
          : '',
      }
    : undefined;
  if (body.referenceConfirmation !== undefined &&
    (!referenceConfirmation?.optionId || !referenceConfirmation.continuationToken)) return null;
  const routingPlanToken = typeof body.routingPlanToken === 'string'
    ? body.routingPlanToken.trim()
    : '';
  if (body.routingPlanToken !== undefined &&
    (!routingPlanToken || routingPlanToken.length > 4_000)) return null;
  if (!/^[A-Za-z0-9:_-]{1,200}$/.test(requestId) ||
    !message || message.length > 1_200 || !conversationId ||
    conversationId.length > 200 || clientRevision === null) return null;
  return {
    requestId, message, language, conversationId, explicitNoteIds,
    conversationAnchorNoteIds,
    clientRevision, stylePrompt,
    recentMessages, referenceConfirmation,
    routingPlanToken: routingPlanToken || undefined,
  };
};

export const validateEmotionChatPlanRequest = (value: unknown) => {
  const body = asObject(value);
  if (!body) return null;
  const allowed = new Set([
    'operation', 'requestId', 'message', 'language', 'conversationId',
    'clientRevision', 'recentMessages',
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key)) ||
    body.operation !== 'plan') return null;
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const conversationId = typeof body.conversationId === 'string'
    ? body.conversationId.trim()
    : '';
  if (body.language !== 'zh' && body.language !== 'en' && body.language !== 'ko') return null;
  const clientRevision = typeof body.clientRevision === 'number' &&
    Number.isSafeInteger(body.clientRevision) && body.clientRevision >= 0
    ? body.clientRevision
    : null;
  if (!Array.isArray(body.recentMessages)) return null;
  const recentMessages = body.recentMessages.flatMap((raw) => {
    const item = asObject(raw);
    if (!item || (item.role !== 'user' && item.role !== 'assistant') ||
      typeof item.body !== 'string') return [];
    const text = item.body.trim().slice(0, 400);
    return text ? [{ role: item.role as 'user' | 'assistant', body: text }] : [];
  }).slice(-20);
  if (
    !/^[A-Za-z0-9:_-]{1,200}$/.test(requestId) ||
    !message || message.length > 1_200 ||
    !conversationId || conversationId.length > 200 ||
    clientRevision === null
  ) return null;
  return {
    operation: 'plan' as const,
    requestId,
    message,
    language: body.language as ChatLanguage,
    conversationId,
    clientRevision,
    recentMessages,
  };
};
