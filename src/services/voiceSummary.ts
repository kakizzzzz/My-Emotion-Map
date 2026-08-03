import type { AppLanguage } from '../i18n';
import type { PlaceRating } from '../types';
import type { CloudAuth } from './supabaseClient';

export type VoiceSummaryTarget = 'title' | 'place_rating' | 'answer';

export type VoiceSummaryResult = {
  summary: string;
  placeRating: PlaceRating | null;
};

const PLACE_RATINGS = new Set<PlaceRating>([
  'safe',
  'comfortable',
  'neutral',
  'uneasy',
  'distressing',
]);

const validateResult = (value: unknown): VoiceSummaryResult | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (payload.status !== 'ready' || !payload.result || typeof payload.result !== 'object') return null;
  const result = payload.result as Record<string, unknown>;
  if (typeof result.summary !== 'string' || !result.summary.trim() || result.summary.length > 600) return null;
  const placeRating = result.placeRating === null
    ? null
    : typeof result.placeRating === 'string' && PLACE_RATINGS.has(result.placeRating as PlaceRating)
      ? result.placeRating as PlaceRating
      : undefined;
  if (placeRating === undefined) return null;
  return { summary: result.summary.trim(), placeRating };
};

export const requestVoiceSummary = async ({
  auth,
  transcript,
  language,
  target,
  signal,
}: {
  auth: CloudAuth;
  transcript: string;
  language: AppLanguage;
  target: VoiceSummaryTarget;
  signal: AbortSignal;
}) => {
  const response = await fetch(`${auth.supabaseUrl}/functions/v1/voice-summary`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      apikey: auth.publishableKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      transcript: transcript.trim().slice(0, 4_000),
      language,
      target,
    }),
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error('voice_summary_unavailable');
  const result = validateResult(payload);
  if (!result) throw new Error('voice_summary_invalid');
  return result;
};
