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
    ? (value as Record<string, unknown>)
    : null;

const normalizeAccountId = (value: string) => value.trim().toLowerCase();

const accountIdToAuthEmail = (accountId: string) => {
  const bytes = new TextEncoder().encode(accountId);
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `u_${hex}@accounts.my-emotion-map.app`;
};

const validateRequest = (value: unknown) => {
  const body = asObject(value);
  if (!body) return null;
  const allowedKeys = new Set([
    'account',
    'password',
    'passwordConfirmation',
  ]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) return null;
  if (
    typeof body.account !== 'string' ||
    typeof body.password !== 'string' ||
    typeof body.passwordConfirmation !== 'string'
  ) {
    return null;
  }
  const account = normalizeAccountId(body.account);
  if (!/^[a-z0-9._-]{3,24}$/.test(account)) return null;
  if (
    body.password.length < 8 ||
    body.password.length > 200 ||
    body.password !== body.passwordConfirmation
  ) {
    return null;
  }
  return { account, password: body.password };
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const claimQuota = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  bucketHash: string,
  limit: number,
) => {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/claim_registration_quota`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_bucket_hash: bucketHash,
        p_limit: limit,
      }),
      signal: AbortSignal.timeout(8_000),
    },
  );
  return response.ok && (await response.json()) === true;
};

const deleteCreatedUser = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
) => {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    signal: AbortSignal.timeout(8_000),
  }).catch(() => undefined);
};

runtime.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight(request);
  const origin = requireAllowedOrigin(request);
  if (!origin) {
    return jsonResponse(
      { status: 'unavailable', code: 'origin_not_allowed' },
      403,
    );
  }
  const headers = {
    ...corsHeaders(origin),
    'cache-control': 'no-store',
  };
  if (request.method !== 'POST') {
    return jsonResponse(
      { status: 'unavailable', code: 'method_not_allowed' },
      405,
      headers,
    );
  }

  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { status: 'unavailable', code: 'service_unavailable' },
      503,
      headers,
    );
  }

  try {
    const body = validateRequest(await readJsonBody(request, 4_096));
    if (!body) {
      return jsonResponse(
        { status: 'unavailable', code: 'invalid_request' },
        400,
        headers,
      );
    }

    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0];
    const source = (
      request.headers.get('cf-connecting-ip') ??
      forwarded ??
      request.headers.get('x-real-ip') ??
      'unknown'
    ).trim().slice(0, 80);
    const [sourceBucket, accountBucket] = await Promise.all([
      sha256(`registration-source:${source}`),
      sha256(`registration-account:${source}:${body.account}`),
    ]);
    const [sourceAllowed, accountAllowed] = await Promise.all([
      claimQuota(supabaseUrl, serviceRoleKey, sourceBucket, 20),
      claimQuota(supabaseUrl, serviceRoleKey, accountBucket, 5),
    ]);
    if (!sourceAllowed || !accountAllowed) {
      return jsonResponse(
        { status: 'retryable', code: 'rate_limited' },
        429,
        headers,
      );
    }

    const createResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/users`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: accountIdToAuthEmail(body.account),
          password: body.password,
          email_confirm: true,
          user_metadata: { account_id: body.account },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const created = createResponse.ok
      ? (asObject(await createResponse.json()))
      : null;
    const createdUser = asObject(created?.user);
    const createdUserId =
      typeof created?.id === 'string'
        ? created.id
        : typeof createdUser?.id === 'string'
          ? createdUser.id
          : null;
    if (!createdUserId) {
      return jsonResponse(
        { status: 'unavailable', code: 'registration_unavailable' },
        createResponse.status === 422 ? 409 : 503,
        headers,
      );
    }

    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/account_profiles`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'content-type': 'application/json',
          prefer: 'return=minimal',
        },
        body: JSON.stringify({
          user_id: createdUserId,
          account_id: body.account,
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!profileResponse.ok) {
      await deleteCreatedUser(supabaseUrl, serviceRoleKey, createdUserId);
      return jsonResponse(
        { status: 'unavailable', code: 'registration_unavailable' },
        503,
        headers,
      );
    }

    return jsonResponse({ status: 'ready' }, 201, headers);
  } catch {
    return jsonResponse(
      { status: 'unavailable', code: 'registration_unavailable' },
      503,
      headers,
    );
  }
});
