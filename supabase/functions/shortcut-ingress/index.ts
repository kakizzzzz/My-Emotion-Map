import { env, jsonResponse, readJsonBody, runtime } from '../_shared/runtime.ts';
import {
  evaluateHeartObservation,
  HEART_ALGORITHM_VERSION,
  SHORTCUT_VERSION,
  type HeartContext,
  type HeartObservationPreferences,
  type HeartSample,
} from '../_shared/heartObservationV3.ts';

type ShortcutToken = {
  id: string;
  user_id: string;
  resting_min: number;
  resting_max: number;
  expires_at: string;
  revoked_at: string | null;
  algorithm_version: string;
  shortcut_version: string;
  single_sample_enabled: boolean;
  workout_policy: HeartObservationPreferences['workoutPolicy'];
  unknown_policy: HeartObservationPreferences['unknownPolicy'];
  cooldown_minutes: number;
};

const EVENT_ID = /^[A-Za-z0-9._:-]{1,180}$/;
const serviceHeaders = () => ({
  apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
  authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
  'content-type': 'application/json',
});
const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const authenticate = async (request: Request): Promise<ShortcutToken | null> => {
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer mes_[a-f0-9]{64}$/.test(authorization)) return null;
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) return null;
  const hash = await sha256(authorization.slice(7));
  const response = await fetch(
    `${env('SUPABASE_URL')}/rest/v1/shortcut_tokens?token_hash=eq.${hash}` +
      '&select=id,user_id,resting_min,resting_max,expires_at,revoked_at,' +
      'algorithm_version,shortcut_version,single_sample_enabled,workout_policy,' +
      'unknown_policy,cooldown_minutes&limit=1',
    { headers: serviceHeaders(), signal: AbortSignal.timeout(8_000) },
  );
  if (!response.ok) return null;
  const rows = await response.json() as ShortcutToken[];
  const token = rows[0];
  if (
    !token || token.revoked_at || Date.parse(token.expires_at) <= Date.now() ||
    token.algorithm_version !== HEART_ALGORITHM_VERSION ||
    token.shortcut_version !== SHORTCUT_VERSION
  ) return null;
  return token;
};

const claimQuota = async (tokenId: string) => {
  try {
    const response = await fetch(
      `${env('SUPABASE_URL')}/rest/v1/rpc/claim_shortcut_quota`,
      {
        method: 'POST',
        headers: serviceHeaders(),
        body: JSON.stringify({ p_token_id: tokenId }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return 'unavailable' as const;
    return await response.json() === true
      ? 'allowed' as const
      : 'limited' as const;
  } catch {
    return 'unavailable' as const;
  }
};

const parseSamples = (value: unknown): HeartSample[] | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return null;
  const samples: HeartSample[] = [];
  for (const raw of value) {
    const item = asObject(raw);
    if (typeof item?.bpm !== 'number' || typeof item.at !== 'string') return null;
    samples.push({ bpm: item.bpm, at: item.at.trim() });
  }
  return samples;
};

runtime.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ status: 'invalid' }, 405);
  const token = await authenticate(request);
  if (!token) return jsonResponse({ status: 'unauthorized' }, 401);
  const quota = await claimQuota(token.id);
  if (quota !== 'allowed') {
    return jsonResponse(
      { status: quota === 'limited' ? 'retryable' : 'unavailable' },
      quota === 'limited' ? 429 : 503,
    );
  }

  let value: unknown;
  try {
    value = await readJsonBody(request, 16_000);
  } catch {
    return jsonResponse({ status: 'invalid' }, 400);
  }
  const payload = asObject(value);
  const eventId = typeof payload?.eventId === 'string' ? payload.eventId.trim() : '';
  const context: HeartContext = payload?.context === 'resting' ||
    payload?.context === 'workout' ? payload.context : 'unknown';
  const samples = parseSamples(payload?.samples);
  if (payload?.version !== 3 || !EVENT_ID.test(eventId) || !samples) {
    return jsonResponse({ status: 'invalid' }, 400);
  }

  const preferences: HeartObservationPreferences = {
    min: token.resting_min,
    max: token.resting_max,
    singleSampleEnabled: token.single_sample_enabled,
    workoutPolicy: token.workout_policy,
    unknownPolicy: token.unknown_policy,
    cooldownMinutes: token.cooldown_minutes,
  };
  const evaluation = evaluateHeartObservation({
    samples,
    context,
    preferences,
    now: Date.now(),
    test: payload.test === true,
  });
  if (evaluation.decision === 'invalid') {
    return jsonResponse({ status: 'invalid', reason: evaluation.decisionReason }, 400);
  }
  if (evaluation.decision !== 'pending') {
    return jsonResponse({
      status: evaluation.decision === 'within_range' ? 'within_range' : 'suppressed',
      reason: evaluation.decisionReason,
      algorithmVersion: evaluation.algorithmVersion,
    });
  }

  const thresholdSnapshot = {
    restingMin: preferences.min,
    restingMax: preferences.max,
    singleSampleEnabled: preferences.singleSampleEnabled,
    workoutPolicy: preferences.workoutPolicy,
    unknownPolicy: preferences.unknownPolicy,
    cooldownMinutes: preferences.cooldownMinutes,
  };
  const acceptedSamples = evaluation.acceptedSamples;
  const response = await fetch(
    `${env('SUPABASE_URL')}/rest/v1/rpc/record_shortcut_observation_v3`,
    {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({
        p_user_id: token.user_id,
        p_token_id: token.id,
        p_event_id: eventId,
        p_sampled_at: acceptedSamples[0].at,
        p_time_zone: typeof payload.timeZone === 'string'
          ? payload.timeZone.trim().slice(0, 100)
          : null,
        p_context: context,
        p_samples: acceptedSamples,
        p_median_bpm: evaluation.medianBpm,
        p_is_test: payload.test === true,
        p_low_signal: evaluation.lowSignal,
        p_decision_reason: evaluation.decisionReason,
        p_threshold_snapshot: thresholdSnapshot,
        p_signal_level: evaluation.lowSignal ? 'low' : 'standard',
        p_side: evaluation.side,
        p_cooldown_minutes: preferences.cooldownMinutes,
      }),
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) return jsonResponse({ status: 'unavailable' }, 503);
  const rows = await response.json() as Array<{
    result?: unknown;
    observation_id?: unknown;
  }>;
  const outcome = rows[0]?.result;
  if (outcome !== 'accepted' && outcome !== 'merged' && outcome !== 'duplicate') {
    return jsonResponse({ status: 'unavailable' }, 503);
  }
  return jsonResponse({
    status: outcome,
    observationId: typeof rows[0]?.observation_id === 'string'
      ? rows[0].observation_id
      : undefined,
    requiresUserConfirmation: true,
    algorithmVersion: HEART_ALGORITHM_VERSION,
  }, outcome === 'duplicate' ? 200 : 202);
});
