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
  status: 'supported' | 'evidence_insufficient' | 'unsupported';
  answer: string;
  evidence: PublicEvidence[];
  confidence: 'low' | 'medium' | 'high';
  limitations: string[];
};

const validateResult = (value: unknown): EmotionChatResult | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (source.status !== 'supported' && source.status !== 'evidence_insufficient' && source.status !== 'unsupported') return null;
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
  const confidence = source.confidence === 'high' || source.confidence === 'medium' ? source.confidence : 'low';
  return {
    status: source.status,
    answer: source.answer,
    evidence,
    confidence,
    limitations: source.limitations.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 300)).slice(0, 5),
  };
};

export const requestEmotionChat = async ({
  auth,
  message,
  language,
  conversationId,
  clientRevision,
  signal,
}: {
  auth: CloudAuth;
  message: string;
  language: AppLanguage;
  conversationId: string;
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
    body: JSON.stringify({ message, language, conversationId, clientRevision }),
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) return null;
  return validateResult(payload);
};
