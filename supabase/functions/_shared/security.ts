import { env, jsonResponse } from './runtime.ts';

const allowedOrigins = () => new Set(
  env('ALLOWED_ORIGINS').split(',').map((value) => value.trim()).filter(Boolean),
);

export const corsHeaders = (origin: string) => ({
  'access-control-allow-origin': origin,
  'access-control-allow-headers': 'authorization, content-type, apikey',
  'access-control-allow-methods': 'POST, OPTIONS',
  'vary': 'origin',
});

export const requireAllowedOrigin = (request: Request) => {
  const origin = request.headers.get('origin') ?? '';
  if (!origin || !allowedOrigins().has(origin)) return null;
  return origin;
};

export const preflight = (request: Request) => {
  const origin = requireAllowedOrigin(request);
  return origin
    ? new Response(null, { status: 204, headers: corsHeaders(origin) })
    : jsonResponse({ error: 'origin_not_allowed' }, 403);
};

export const authenticate = async (request: Request) => {
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9._~-]+$/.test(authorization) || authorization.length > 4096) {
    return null;
  }
  const supabaseUrl = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { authorization, apikey: anonKey },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: unknown };
  return typeof user.id === 'string'
    ? { userId: user.id, authorization, supabaseUrl, anonKey }
    : null;
};

export type AuthenticatedSession = NonNullable<Awaited<ReturnType<typeof authenticate>>>;
