import { env, jsonResponse, readJsonBody, runtime } from '../_shared/runtime.ts';

type ShortcutToken = {
  id: string;
  user_id: string;
  resting_min: number;
  resting_max: number;
  expires_at: string;
  revoked_at: string | null;
};
type Sample = { bpm: number; at: string };

const EVENT_ID = /^[A-Za-z0-9._:-]{1,180}$/;
const OFFSET_TIME = /(Z|[+-]\d{2}:?\d{2})$/i;
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
      '&select=id,user_id,resting_min,resting_max,expires_at,revoked_at&limit=1',
    { headers: serviceHeaders(), signal: AbortSignal.timeout(8_000) },
  );
  if (!response.ok) return null;
  const rows = await response.json() as ShortcutToken[];
  const token = rows[0];
  if (!token || token.revoked_at || Date.parse(token.expires_at) <= Date.now()) return null;
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

const parseSamples = (value: unknown): Sample[] | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return null;
  const samples: Sample[] = [];
  for (const raw of value) {
    const item = asObject(raw);
    const bpm = Number(item?.bpm);
    const at = typeof item?.at === 'string' ? item.at.trim() : '';
    if (!Number.isFinite(bpm) || bpm < 20 || bpm > 260 ||
      !OFFSET_TIME.test(at) || Number.isNaN(Date.parse(at))) return null;
    samples.push({ bpm: Math.round(bpm), at });
  }
  return samples.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
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
  const context = payload?.context === 'resting' || payload?.context === 'workout'
    ? payload.context
    : 'unknown';
  const samples = parseSamples(payload?.samples);
  if (payload?.version !== 2 || !EVENT_ID.test(eventId) || !samples) {
    return jsonResponse({ status: 'invalid' }, 400);
  }
  const latestTime = Date.parse(samples[0].at);
  const age = Date.now() - latestTime;
  if (age < -2 * 60_000 || age > 10 * 60_000) {
    return jsonResponse({ status: 'invalid', reason: 'freshness' }, 400);
  }
  const recent = samples.slice(0, 3);
  const outside = recent.filter(
    (sample) => sample.bpm < token.resting_min || sample.bpm > token.resting_max,
  ).length;
  if (context === 'resting' && recent.length >= 3 && outside < 2 && payload.test !== true) {
    return jsonResponse({ status: 'within_range' });
  }
  const sortedBpms = samples.map((sample) => sample.bpm).sort((a, b) => a - b);
  const median = sortedBpms[Math.floor(sortedBpms.length / 2)];
  const lowSignal = recent.length < 3 || context !== 'resting';
  const decisionReason = payload.test === true
    ? 'test_event'
    : context !== 'resting'
      ? 'non_resting_review'
      : lowSignal
        ? 'low_signal_review'
        : 'outside_resting_range';
  const response = await fetch(`${env('SUPABASE_URL')}/rest/v1/shortcut_observations`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(),
      prefer: 'return=representation,resolution=ignore-duplicates',
    },
    body: JSON.stringify({
      user_id: token.user_id,
      token_id: token.id,
      event_id: eventId,
      sampled_at: samples[0].at,
      time_zone: typeof payload.timeZone === 'string'
        ? payload.timeZone.trim().slice(0, 100)
        : null,
      context,
      samples,
      median_bpm: median,
      is_test: payload.test === true,
      low_signal: lowSignal,
      decision_reason: decisionReason,
      threshold_snapshot: {
        restingMin: token.resting_min,
        restingMax: token.resting_max,
      },
      algorithm_version: 'shortcut-heart-v2',
      signal_level: lowSignal ? 'low' : 'standard',
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return jsonResponse({ status: 'unavailable' }, 503);
  const rows = await response.json() as Array<{ id?: unknown }>;
  return jsonResponse({
    status: rows[0]?.id ? 'accepted' : 'duplicate',
    requiresUserConfirmation: true,
  }, rows[0]?.id ? 202 : 200);
});
