import type { AppLanguage } from '../i18n';
import type { CloudAuth } from './supabaseClient';

export type PublicEvidence = {
  noteId: string;
  title: string;
  date: string;
  place: string;
  matchReason: string;
};

export type EmotionChatResult = {
  intent: 'lookup' | 'comparison' | 'pattern' | 'reflection' | 'unsupported';
  retrievalStatus: 'supported' | 'ambiguous' | 'not_found' | 'evidence_insufficient' | 'unavailable';
  status: 'supported' | 'ambiguous' | 'not_found' | 'evidence_insufficient' | 'unavailable';
  answer: string;
  evidence: PublicEvidence[];
  confidence: 'none' | 'low' | 'medium' | 'high';
  limitations: string[];
  clarificationOptions?: string[];
};

const validateResult = (value: unknown): EmotionChatResult | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const statuses = new Set(['supported', 'ambiguous', 'not_found', 'evidence_insufficient', 'unavailable']);
  const intents = new Set(['lookup', 'comparison', 'pattern', 'reflection', 'unsupported']);
  if (!statuses.has(String(source.status)) || !statuses.has(String(source.retrievalStatus)) || !intents.has(String(source.intent))) return null;
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
  const confidence = source.confidence === 'high' || source.confidence === 'medium' || source.confidence === 'low' ? source.confidence : 'none';
  return {
    intent: source.intent as EmotionChatResult['intent'],
    retrievalStatus: source.retrievalStatus as EmotionChatResult['retrievalStatus'],
    status: source.status as EmotionChatResult['status'],
    answer: source.answer,
    evidence,
    confidence,
    limitations: source.limitations.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 300)).slice(0, 5),
    clarificationOptions: Array.isArray(source.clarificationOptions)
      ? source.clarificationOptions
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.slice(0, 100))
          .slice(0, 3)
      : undefined,
  };
};

export const requestEmotionChat = async ({
  auth,
  message,
  language,
  conversationId,
  selectedNoteIds,
  responseStyle = [],
  clientRevision,
  signal,
}: {
  auth: CloudAuth;
  message: string;
  language: AppLanguage;
  conversationId: string;
  selectedNoteIds: string[];
  responseStyle?: Array<'concise' | 'direct' | 'gentle'>;
  clientRevision: number;
  signal: AbortSignal;
}) => {
  const response = await fetch(`${auth.supabaseUrl}/functions/v1/emotion-chat`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      apikey: auth.publishableKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message,
      language,
      conversationId,
      selectedNoteIds: selectedNoteIds.slice(0, 6),
      responseStyle: responseStyle.slice(0, 3),
      clientRevision,
    }),
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) return null;
  return validateResult(payload);
};
