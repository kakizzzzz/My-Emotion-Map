import type { SupabaseClient } from '@supabase/supabase-js';
import type { HealthPreferences } from '../types';
import {
  SHORTCUT_REFRESH_EVENT,
  type ShortcutConnectionStatus,
  type ShortcutPairing,
  type ShortcutTestResult,
} from '../domain/shortcutConnection';
import {
  HEART_ALGORITHM_VERSION,
  SHORTCUT_VERSION,
} from '../../supabase/functions/_shared/heartObservationV3';

export const createShortcutAccessHandlers = ({
  client,
  userId,
  available,
  preferences,
}: {
  client: SupabaseClient | null;
  userId: string | null;
  available: boolean;
  preferences: HealthPreferences;
}) => {
  const issueShortcutPairing = async (): Promise<ShortcutPairing | null> => {
    if (!client || !available || !preferences.rangeConfirmed) return null;
    const { data, error } = await client.rpc('issue_shortcut_pairing', {
      p_resting_min: preferences.restingHeartRateMin,
      p_resting_max: preferences.restingHeartRateMax,
      p_single_sample_enabled: preferences.singleSampleEnabled,
      p_workout_policy: preferences.workoutPolicy,
      p_unknown_policy: preferences.unknownPolicy,
      p_cooldown_minutes: preferences.cooldownMinutes,
    });
    const row = Array.isArray(data) ? data[0] : data;
    return !error && row && typeof row.token === 'string' &&
      typeof row.expires_at === 'string' &&
      row.shortcut_version === SHORTCUT_VERSION &&
      row.algorithm_version === HEART_ALGORITHM_VERSION
      ? {
          token: row.token,
          expiresAt: row.expires_at,
          shortcutVersion: row.shortcut_version,
          algorithmVersion: row.algorithm_version,
        }
      : null;
  };

  const revokeShortcutTokens = async () => {
    if (!client || !userId) return false;
    const { error } = await client.rpc('revoke_all_shortcut_tokens');
    return !error;
  };

  const getShortcutConnectionStatus = async (): Promise<ShortcutConnectionStatus> => {
    const disconnected: ShortcutConnectionStatus = {
      state: 'disconnected', expiresAt: null, lastReceivedAt: null,
      lastTestAt: null, shortcutVersion: null, algorithmVersion: null,
    };
    if (!client || !available) return disconnected;
    const { data, error } = await client
      .from('shortcut_tokens')
      .select(
        'expires_at,revoked_at,algorithm_version,shortcut_version,' +
        'single_sample_enabled,workout_policy,unknown_policy,cooldown_minutes,' +
        'resting_min,resting_max,last_received_at,last_test_at,created_at',
      )
      .order('created_at', { ascending: false })
      .limit(1);
    const row = Array.isArray(data)
      ? data[0] as unknown as Record<string, unknown>
      : null;
    if (error || !row) return { ...disconnected, state: 'not_installed' };
    const expiresAt = typeof row.expires_at === 'string' ? row.expires_at : null;
    const shortcutVersion = typeof row.shortcut_version === 'string'
      ? row.shortcut_version : null;
    const algorithmVersion = typeof row.algorithm_version === 'string'
      ? row.algorithm_version : null;
    const base = {
      expiresAt,
      lastReceivedAt: typeof row.last_received_at === 'string'
        ? row.last_received_at : null,
      lastTestAt: typeof row.last_test_at === 'string' ? row.last_test_at : null,
      shortcutVersion,
      algorithmVersion,
    };
    if (row.revoked_at) return { ...base, state: 'disconnected' };
    if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
      return { ...base, state: 'expired' };
    }
    if (
      shortcutVersion !== SHORTCUT_VERSION ||
      algorithmVersion !== HEART_ALGORITHM_VERSION
    ) return { ...base, state: 'stale_version' };
    const policyMatches =
      Number(row.resting_min) === preferences.restingHeartRateMin &&
      Number(row.resting_max) === preferences.restingHeartRateMax &&
      row.single_sample_enabled === preferences.singleSampleEnabled &&
      row.workout_policy === preferences.workoutPolicy &&
      row.unknown_policy === preferences.unknownPolicy &&
      Number(row.cooldown_minutes) === preferences.cooldownMinutes;
    if (!policyMatches) return { ...base, state: 'disconnected' };
    return { ...base, state: base.lastTestAt ? 'verified' : 'paired' };
  };

  const testShortcutPairing = async (
    pairingToken: string,
  ): Promise<ShortcutTestResult> => {
    if (!client || !available || !/^mes_[a-f0-9]{64}$/.test(pairingToken)) {
      return 'unavailable';
    }
    const baseUrl = (
      import.meta.env.VITE_SUPABASE_URL as string | undefined
    )?.trim().replace(/\/$/, '') ?? '';
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(baseUrl)) {
      return 'unavailable';
    }
    const eventId = `shortcut-test:${crypto.randomUUID()}`;
    const sampledAt = new Date().toISOString();
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/functions/v1/shortcut-ingress`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${pairingToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          version: 3,
          eventId,
          context: 'unknown',
          samples: [{ bpm: preferences.restingHeartRateMax + 6, at: sampledAt }],
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          test: true,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return 'retryable';
    }
    if (response.status === 401) return 'unauthorized';
    if (response.status === 429 || response.status >= 500) return 'retryable';
    if (!response.ok) return 'unavailable';
    const payload = await response.json().catch(() => null) as {
      status?: unknown;
    } | null;
    if (payload?.status !== 'accepted' && payload?.status !== 'duplicate') {
      return 'unavailable';
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { data, error } = await client
        .from('shortcut_observations')
        .select('id,event_id')
        .eq('event_id', eventId)
        .limit(1);
      if (!error && Array.isArray(data) && data.length === 1) {
        window.dispatchEvent(new Event(SHORTCUT_REFRESH_EVENT));
        return 'verified';
      }
      if (attempt < 3) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    }
    return 'retryable';
  };

  return {
    issueShortcutPairing,
    revokeShortcutTokens,
    getShortcutConnectionStatus,
    testShortcutPairing,
  };
};
