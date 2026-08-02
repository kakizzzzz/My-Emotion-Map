import {
  corsHeaders,
  preflight,
  requireAllowedOrigin,
} from '../_shared/security.ts';
import {
  env,
  jsonResponse,
  readJsonBody,
  runtime,
} from '../_shared/runtime.ts';

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const validateRequest = (value: unknown) => {
  const body = asObject(value);
  if (!body || Object.keys(body).some((key) => key !== 'account' && key !== 'password')) {
    return null;
  }
  if (typeof body.account !== 'string' || typeof body.password !== 'string') return null;
  const account = body.account.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,24}$/.test(account)) return null;
  if (body.password.length < 8 || body.password.length > 200) return null;
  return { account, password: body.password };
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const serviceHeaders = (serviceRoleKey: string) => ({
  authorization: `Bearer ${serviceRoleKey}`,
  apikey: serviceRoleKey,
  'content-type': 'application/json',
});

const claimQuota = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  bucketHash: string,
  limit: number,
) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_registration_quota`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify({ p_bucket_hash: bucketHash, p_limit: limit }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return 'unavailable' as const;
  const result = await response.json().catch(() => null);
  return result === true
    ? 'allowed' as const
    : result === false
      ? 'limited' as const
      : 'unavailable' as const;
};

const resolveAccount = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  account: string,
) => {
  const profileResponse = await fetch(
    `${supabaseUrl}/rest/v1/account_profiles?account_id=eq.${encodeURIComponent(account)}&select=user_id&limit=1`,
    {
      headers: serviceHeaders(serviceRoleKey),
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!profileResponse.ok) return null;
  const rows = await profileResponse.json().catch(() => null);
  const row = Array.isArray(rows) ? asObject(rows[0]) : null;
  const userId = typeof row?.user_id === 'string' ? row.user_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    headers: serviceHeaders(serviceRoleKey),
    signal: AbortSignal.timeout(8_000),
  });
  if (!userResponse.ok) return null;
  const user = asObject(await userResponse.json().catch(() => null));
  const email = typeof user?.email === 'string' ? user.email.trim() : '';
  return email && user?.id === userId ? { userId, email } : null;
};

runtime.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight(request);
  const origin = requireAllowedOrigin(request);
  if (!origin) {
    return jsonResponse({ status: 'unavailable', code: 'origin_not_allowed' }, 403);
  }
  const headers = { ...corsHeaders(origin), 'cache-control': 'no-store' };
  if (request.method !== 'POST') {
    return jsonResponse({ status: 'unavailable', code: 'method_not_allowed' }, 405, headers);
  }

  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = env('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ status: 'unavailable', code: 'service_unavailable' }, 503, headers);
  }

  try {
    const body = validateRequest(await readJsonBody(request, 4_096));
    if (!body) {
      return jsonResponse({ status: 'unavailable', code: 'invalid_request' }, 400, headers);
    }
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0];
    const source = (
      request.headers.get('cf-connecting-ip') ??
      forwarded ??
      request.headers.get('x-real-ip') ??
      'unknown'
    ).trim().slice(0, 80);
    const [sourceBucket, accountBucket] = await Promise.all([
      sha256(`login-source:${source}`),
      sha256(`login-account:${source}:${body.account}`),
    ]);
    const sourceQuota = await claimQuota(
      supabaseUrl,
      serviceRoleKey,
      sourceBucket,
      40,
    );
    const accountQuota = sourceQuota === 'allowed'
      ? await claimQuota(
          supabaseUrl,
          serviceRoleKey,
          accountBucket,
          12,
        )
      : sourceQuota;
    if (sourceQuota === 'unavailable' || accountQuota === 'unavailable') {
      return jsonResponse({ status: 'retryable', code: 'quota_unavailable' }, 503, headers);
    }
    if (sourceQuota === 'limited' || accountQuota === 'limited') {
      return jsonResponse({ status: 'retryable', code: 'rate_limited' }, 429, headers);
    }

    const account = await resolveAccount(supabaseUrl, serviceRoleKey, body.account);
    if (!account) {
      return jsonResponse({ status: 'unavailable', code: 'invalid_credentials' }, 401, headers);
    }
    const tokenResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: body.password }),
      signal: AbortSignal.timeout(10_000),
    });
    const token = asObject(await tokenResponse.json().catch(() => null));
    const user = asObject(token?.user);
    const accessToken = typeof token?.access_token === 'string' ? token.access_token : '';
    const refreshToken = typeof token?.refresh_token === 'string' ? token.refresh_token : '';
    if (!tokenResponse.ok || user?.id !== account.userId || !accessToken || !refreshToken) {
      return jsonResponse({ status: 'unavailable', code: 'invalid_credentials' }, 401, headers);
    }
    return jsonResponse({
      status: 'ready',
      session: {
        accessToken,
        refreshToken,
        userId: account.userId,
      },
    }, 200, headers);
  } catch {
    return jsonResponse({ status: 'retryable', code: 'login_unavailable' }, 503, headers);
  }
});
