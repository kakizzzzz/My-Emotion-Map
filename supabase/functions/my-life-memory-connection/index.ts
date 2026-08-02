import {
  MLM_MAX_RESPONSE_BYTES,
  MLM_PROTOCOL_VERSION,
  configuredMlmEndpoint,
  validateMlmHandshake,
} from '../_shared/myLifeMemoryMcp.ts';
import {
  decryptMlmCredential,
  encryptMlmCredential,
  type EncryptedMlmCredential,
} from '../_shared/mlmCredentialCrypto.ts';
import { corsHeaders, authenticate, preflight, requireAllowedOrigin } from '../_shared/security.ts';
import { env, jsonResponse, readJsonBody, runtime } from '../_shared/runtime.ts';

type ConnectionAction = 'connect' | 'test' | 'status' | 'disconnect';
type ConnectionRow = {
  credential_ciphertext: string;
  credential_iv: string;
  credential_key_version: number;
  status: 'connected' | 'unavailable';
  server_version: string;
  protocol_version: string;
  manifest_hash: string;
  connected_at: string;
  last_test_at: string;
  last_error_code: string | null;
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export const validateConnectionRequest = (value: unknown) => {
  const body = asObject(value);
  if (!body || typeof body.action !== 'string' ||
    !['connect', 'test', 'status', 'disconnect'].includes(body.action) ||
    Object.keys(body).some((key) => key !== 'action' && key !== 'token')) {
    return null;
  }
  const action = body.action as ConnectionAction;
  if (action === 'connect') {
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (token.length < 20 || token.length > 1_024 || /\s/.test(token)) return null;
    return { action, token };
  }
  if (body.token !== undefined) return null;
  return { action, token: null };
};

const officialEndpoint = () => {
  return configuredMlmEndpoint(env('MY_LIFE_MEMORY_MCP_URL'));
};

const readBoundedJson = async (response: Response) => {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MLM_MAX_RESPONSE_BYTES) throw new Error('remote_response_too_large');
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MLM_MAX_RESPONSE_BYTES) {
    throw new Error('remote_response_too_large');
  }
  return JSON.parse(raw) as unknown;
};

const callRpc = async (
  endpoint: string,
  token: string,
  body: Record<string, unknown>,
  protocolVersion?: string,
) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(protocolVersion ? { 'mcp-protocol-version': protocolVersion } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'remote_unauthorized' : 'remote_unavailable');
  return readBoundedJson(response);
};

const verifyRemote = async (
  endpoint: string,
  token: string,
  expectedManifestHash: string,
) => {
  const initialize = await callRpc(endpoint, token, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: MLM_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'my-emotion-map', version: '1' },
    },
  });
  const initResult = asObject(asObject(initialize)?.result);
  const protocolVersion = typeof initResult?.protocolVersion === 'string'
    ? initResult.protocolVersion
    : MLM_PROTOCOL_VERSION;
  const toolsList = await callRpc(endpoint, token, {
    jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
  }, protocolVersion);
  return validateMlmHandshake(
    { initialize, toolsList },
    { expectedManifestHash },
  );
};

const publicStatus = (row: ConnectionRow | null) => row ? {
  state: row.status,
  serverVersion: row.server_version,
  protocolVersion: row.protocol_version,
  manifestHash: row.manifest_hash,
  connectedAt: row.connected_at,
  lastTestAt: row.last_test_at,
  lastErrorCode: row.last_error_code,
} : {
  state: 'disconnected',
  serverVersion: null,
  protocolVersion: null,
  manifestHash: null,
  connectedAt: null,
  lastTestAt: null,
  lastErrorCode: null,
};

const serviceHeaders = (serviceRoleKey: string, prefer?: string) => ({
  authorization: `Bearer ${serviceRoleKey}`,
  apikey: serviceRoleKey,
  'content-type': 'application/json',
  ...(prefer ? { prefer } : {}),
});

const connectionFilter = (userId: string) =>
  `user_id=eq.${encodeURIComponent(userId)}&provider=eq.my_life_memory`;

const readConnection = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
) => {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/ai_mcp_connections?select=credential_ciphertext,credential_iv,credential_key_version,status,server_version,protocol_version,manifest_hash,connected_at,last_test_at,last_error_code&${connectionFilter(userId)}&limit=1`,
    { headers: serviceHeaders(serviceRoleKey), signal: AbortSignal.timeout(4_000) },
  );
  if (!response.ok) throw new Error('connection_unavailable');
  const rows = await response.json() as ConnectionRow[];
  return rows[0] ?? null;
};

const updateConnection = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  payload: Record<string, unknown>,
) => fetch(
  `${supabaseUrl}/rest/v1/ai_mcp_connections?${connectionFilter(userId)}`,
  {
    method: 'PATCH',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(4_000),
  },
);

runtime.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight(request);
  const origin = requireAllowedOrigin(request);
  if (!origin) return jsonResponse({ status: 'unavailable', code: 'origin_not_allowed' }, 403);
  const headers = corsHeaders(origin);
  if (request.method !== 'POST') return jsonResponse({ status: 'unavailable', code: 'method_not_allowed' }, 405, headers);
  const session = await authenticate(request);
  if (!session) return jsonResponse({ status: 'unavailable', code: 'unauthorized' }, 401, headers);
  try {
    const body = validateConnectionRequest(await readJsonBody(request, 4_096));
    if (!body) return jsonResponse({ status: 'unavailable', code: 'invalid_request' }, 400, headers);
    const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const credentialKey = env('MY_LIFE_MEMORY_CREDENTIAL_KEY');
    const expectedManifestHash = env('MY_LIFE_MEMORY_MCP_MANIFEST_SHA256');
    const endpoint = officialEndpoint();
    if (!serviceRoleKey || !credentialKey || !endpoint ||
      !/^[a-f0-9]{64}$/.test(expectedManifestHash)) {
      return jsonResponse({ status: 'unavailable', code: 'connection_not_configured' }, 503, headers);
    }
    if (body.action !== 'status') {
      const quotaResponse = await fetch(
        `${session.supabaseUrl}/rest/v1/rpc/claim_ai_mcp_connection_quota`,
        {
          method: 'POST',
          headers: serviceHeaders(serviceRoleKey),
          body: JSON.stringify({ p_user_id: session.userId }),
          signal: AbortSignal.timeout(4_000),
        },
      );
      const allowed = quotaResponse.ok
        ? await quotaResponse.json().catch(() => false)
        : false;
      if (allowed !== true) {
        return jsonResponse({ status: 'retryable', code: 'rate_limited' }, 429, headers);
      }
    }
    if (body.action === 'disconnect') {
      const result = await fetch(
        `${session.supabaseUrl}/rest/v1/ai_mcp_connections?${connectionFilter(session.userId)}`,
        {
          method: 'DELETE',
          headers: serviceHeaders(serviceRoleKey),
          signal: AbortSignal.timeout(4_000),
        },
      );
      return !result.ok
        ? jsonResponse({ status: 'retryable', code: 'disconnect_failed' }, 503, headers)
        : jsonResponse({ status: 'ok', connection: publicStatus(null) }, 200, headers);
    }
    const connection = await readConnection(
      session.supabaseUrl,
      serviceRoleKey,
      session.userId,
    );
    if (body.action === 'status') {
      return jsonResponse({ status: 'ok', connection: publicStatus(connection) }, 200, headers);
    }
    const token = body.action === 'connect'
      ? body.token
      : connection
        ? await decryptMlmCredential({
            ciphertext: connection.credential_ciphertext,
            iv: connection.credential_iv,
            keyVersion: connection.credential_key_version as 1,
          }, credentialKey)
        : null;
    if (!token) return jsonResponse({ status: 'unavailable', code: 'not_connected' }, 404, headers);
    const verification = await verifyRemote(endpoint, token, expectedManifestHash);
    if (!verification.ok) {
      if (connection) {
        await updateConnection(session.supabaseUrl, serviceRoleKey, session.userId, {
          status: 'unavailable',
          last_error_code: verification.code,
          last_test_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      return jsonResponse({ status: 'unavailable', code: verification.code }, 422, headers);
    }
    const now = new Date().toISOString();
    if (body.action === 'connect') {
      const encrypted: EncryptedMlmCredential = await encryptMlmCredential(token, credentialKey);
      const result = await fetch(
        `${session.supabaseUrl}/rest/v1/ai_mcp_connections?on_conflict=user_id,provider`,
        {
          method: 'POST',
          headers: serviceHeaders(serviceRoleKey, 'resolution=merge-duplicates'),
          body: JSON.stringify({
            user_id: session.userId,
            provider: 'my_life_memory',
            endpoint_id: 'my-life-memory-official',
            credential_ciphertext: encrypted.ciphertext,
            credential_iv: encrypted.iv,
            credential_key_version: encrypted.keyVersion,
            manifest_hash: verification.manifestHash,
            server_name: 'my-life-memory',
            server_version: verification.serverVersion,
            protocol_version: verification.protocolVersion,
            status: 'connected',
            last_error_code: null,
            connected_at: now,
            last_test_at: now,
            updated_at: now,
          }),
          signal: AbortSignal.timeout(4_000),
        },
      );
      if (!result.ok) return jsonResponse({ status: 'retryable', code: 'connection_save_failed' }, 503, headers);
    } else {
      await updateConnection(session.supabaseUrl, serviceRoleKey, session.userId, {
        status: 'connected',
        last_error_code: null,
        server_version: verification.serverVersion,
        protocol_version: verification.protocolVersion,
        manifest_hash: verification.manifestHash,
        last_test_at: now,
        updated_at: now,
      });
    }
    return jsonResponse({
      status: 'ok',
      connection: {
        state: 'connected',
        serverVersion: verification.serverVersion,
        protocolVersion: verification.protocolVersion,
        manifestHash: verification.manifestHash,
        connectedAt: body.action === 'connect' ? now : connection?.connected_at ?? now,
        lastTestAt: now,
        lastErrorCode: null,
      },
    }, 200, headers);
  } catch (error) {
    const code = error instanceof Error && [
      'remote_unauthorized', 'remote_unavailable', 'remote_response_too_large',
      'credential_invalid', 'credential_key_invalid', 'request_too_large',
    ].includes(error.message) ? error.message : 'connection_failed';
    const retryable = code === 'remote_unavailable';
    return jsonResponse({ status: retryable ? 'retryable' : 'unavailable', code }, code === 'request_too_large' ? 413 : 503, headers);
  }
});
