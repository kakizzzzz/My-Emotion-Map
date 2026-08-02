import { env } from './runtime.ts';
import { isMcpOwner } from './mcpValidation.ts';

export type EmotionMapMcpToken = {
  id: string;
  userId: string;
  kind: 'output' | 'action';
  scopes: string[];
};

export type McpServiceConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

const serviceConfig = (): McpServiceConfig => ({
  supabaseUrl: env('SUPABASE_URL'),
  serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
});

const serviceHeaders = (serviceRoleKey: string, prefer?: string) => ({
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  'content-type': 'application/json',
  ...(prefer ? { prefer } : {}),
});

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const allowedMcpOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  if (!origin) return '';
  const allowed = new Set(env('MCP_ALLOWED_ORIGINS').split(',')
    .map((value) => value.trim()).filter(Boolean));
  return allowed.has(origin) ? origin : null;
};

export const mcpRequestAllowed = (request: Request) => {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) return false;
  const accept = request.headers.get('accept')?.toLowerCase() ?? '';
  if (accept && !accept.includes('application/json') && !accept.includes('*/*')) return false;
  return allowedMcpOrigin(request) !== null;
};

export const mcpOriginHeaders = (request: Request): Record<string, string> => {
  const origin = allowedMcpOrigin(request);
  return origin ? {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers':
      'authorization, content-type, accept, mcp-protocol-version',
    vary: 'origin',
  } : {};
};

export const mcpPreflightResponse = (request: Request) => {
  const origin = allowedMcpOrigin(request);
  return origin
    ? new Response(null, { status: 204, headers: mcpOriginHeaders(request) })
    : null;
};

export const authenticateMcpToken = async (
  request: Request,
  expectedKind: 'output' | 'action',
  config = serviceConfig(),
): Promise<EmotionMapMcpToken | null> => {
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer mem_[a-f0-9]{64}$/.test(authorization)) return null;
  const { supabaseUrl, serviceRoleKey } = config;
  if (!supabaseUrl || !serviceRoleKey) return null;
  const tokenHash = await sha256(authorization.slice(7));
  const response = await fetch(
    `${supabaseUrl}/rest/v1/mcp_tokens?token_hash=eq.${tokenHash}` +
      '&select=id,user_id,kind,scopes,expires_at,revoked_at&limit=1',
    {
      headers: serviceHeaders(serviceRoleKey),
      signal: AbortSignal.timeout(8_000),
    },
  ).catch(() => null);
  if (!response?.ok) return null;
  const rows = await response.json().catch(() => []) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row || row.kind !== expectedKind || row.revoked_at ||
    typeof row.expires_at !== 'string' || Date.parse(row.expires_at) <= Date.now() ||
    typeof row.id !== 'string' || typeof row.user_id !== 'string' ||
    !Array.isArray(row.scopes) || row.scopes.some((scope) => typeof scope !== 'string')) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    kind: expectedKind,
    scopes: row.scopes as string[],
  };
};

export const claimMcpQuota = async (tokenId: string) => {
  const { supabaseUrl, serviceRoleKey } = serviceConfig();
  if (!supabaseUrl || !serviceRoleKey) return false;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_mcp_quota`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify({ p_token_id: tokenId }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  return Boolean(response?.ok && await response.json().catch(() => false) === true);
};

export const touchMcpToken = async (token: EmotionMapMcpToken) => {
  const { supabaseUrl, serviceRoleKey } = serviceConfig();
  if (!supabaseUrl || !serviceRoleKey) return false;
  const response = await fetch(
    `${supabaseUrl}/rest/v1/mcp_tokens?id=eq.${encodeURIComponent(token.id)}` +
      `&user_id=eq.${encodeURIComponent(token.userId)}&kind=eq.${token.kind}`,
    {
      method: 'PATCH',
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(4_000),
    },
  ).catch(() => null);
  return Boolean(response?.ok);
};

export const loadOwnerAppState = async (
  token: EmotionMapMcpToken,
  config = serviceConfig(),
) => {
  const { supabaseUrl, serviceRoleKey } = config;
  if (!supabaseUrl || !serviceRoleKey) return null;
  const response = await fetch(
    `${supabaseUrl}/rest/v1/app_states?user_id=eq.${encodeURIComponent(token.userId)}` +
      '&select=user_id,revision,payload&limit=1',
    {
      headers: serviceHeaders(serviceRoleKey),
      signal: AbortSignal.timeout(8_000),
    },
  ).catch(() => null);
  if (!response?.ok) return null;
  const rows = await response.json().catch(() => []) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return { revision: 0, payload: null };
  if (!isMcpOwner(token.userId, row.user_id)) return null;
  const revision = Number(row.revision);
  return Number.isSafeInteger(revision) && revision >= 0
    ? { revision, payload: row.payload }
    : null;
};

export const mcpServiceRequest = async (
  path: string,
  init: RequestInit,
) => {
  const { supabaseUrl, serviceRoleKey } = serviceConfig();
  if (!supabaseUrl || !serviceRoleKey) return null;
  return fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: { ...serviceHeaders(serviceRoleKey), ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(8_000),
  }).catch(() => null);
};
