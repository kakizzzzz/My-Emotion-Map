import type { ChatLanguage } from './chatGrounding.ts';

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export const validateEmotionChatRequest = (value: unknown) => {
  const body = asObject(value);
  if (!body) return null;
  const allowed = new Set([
    'requestId', 'message', 'language', 'conversationId', 'selectedNoteIds',
    'clientRevision', 'responseStyle', 'referenceConfirmation',
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return null;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  if (body.language !== 'zh' && body.language !== 'en' && body.language !== 'ko') return null;
  const language: ChatLanguage = body.language;
  const conversationId = typeof body.conversationId === 'string'
    ? body.conversationId.trim()
    : '';
  if (body.selectedNoteIds !== undefined &&
    (!Array.isArray(body.selectedNoteIds) || body.selectedNoteIds.length > 6 ||
      body.selectedNoteIds.some((item) =>
        typeof item !== 'string' || !item || item.length > 200))) return null;
  const selectedNoteIds = Array.isArray(body.selectedNoteIds)
    ? [...new Set(body.selectedNoteIds)] as string[]
    : [];
  const responseStyle = Array.isArray(body.responseStyle)
    ? [...new Set(body.responseStyle.filter((item): item is string =>
        item === 'concise' || item === 'direct' || item === 'gentle',
      ))].slice(0, 3)
    : [];
  if (body.responseStyle !== undefined && !Array.isArray(body.responseStyle)) return null;
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
  if (!/^[A-Za-z0-9:_-]{1,200}$/.test(requestId) ||
    !message || message.length > 1_200 || !conversationId ||
    conversationId.length > 200 || clientRevision === null) return null;
  return {
    requestId, message, language, conversationId, selectedNoteIds,
    clientRevision, responseStyle, referenceConfirmation,
  };
};
