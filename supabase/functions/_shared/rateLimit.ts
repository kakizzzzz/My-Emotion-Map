import type { AuthenticatedSession } from './security.ts';

export const claimAiQuota = async (
  session: AuthenticatedSession,
  feature: 'photo-assist' | 'emotion-chat',
) => {
  try {
    const response = await fetch(`${session.supabaseUrl}/rest/v1/rpc/claim_ai_quota`, {
      method: 'POST',
      headers: {
        authorization: session.authorization,
        apikey: session.anonKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_feature: feature }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return 'unavailable' as const;
    return (await response.json()) === true ? 'allowed' as const : 'limited' as const;
  } catch {
    return 'unavailable' as const;
  }
};
