import { env, jsonResponse, readJsonBody, runtime } from '../_shared/runtime.ts';
import {
  authenticateMcpToken,
  claimMcpQuota,
  mcpOriginHeaders,
  mcpPreflightResponse,
  mcpRequestAllowed,
  touchMcpToken,
} from '../_shared/emotionMapMcpAuth.ts';
import { queueEmotionMapProposal } from '../_shared/emotionMapMcpActions.ts';
import { EMOTION_MAP_ACTION_TOOLS } from '../_shared/emotionMapMcpManifest.ts';
import { validateEmotionMapToolInput, validateEmotionMapToolOutput } from '../_shared/emotionMapMcpValidation.ts';
import { MCP_ACTION_SCOPE } from '../_shared/mcpValidation.ts';
import {
  MCP_PROTOCOL_VERSION,
  McpRpcFault,
  dispatchMcpEnvelope,
  mcpTransportHeaders,
  negotiateMcpProtocol,
  type McpRpcMessage,
} from '../_shared/mcpTransport.ts';
import {
  loadNormalizedEmotionActionContext,
  type NormalizedEmotionAccess,
} from '../_shared/normalizedEmotionRepository.ts';

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const rpcError = (
  code: number,
  message: string,
  status: number,
  headers: HeadersInit,
) => jsonResponse(
  { jsonrpc: '2.0', id: null, error: { code, message } },
  status,
  headers,
);

const toolResult = (value: unknown, isError = false) => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
  structuredContent: value,
  isError,
});

const normalizedAccess = (userId: string): NormalizedEmotionAccess => {
  const apiKey = env('SUPABASE_SERVICE_ROLE_KEY');
  return {
    supabaseUrl: env('SUPABASE_URL'),
    userId,
    authorization: `Bearer ${apiKey}`,
    apiKey,
  };
};

runtime.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return mcpPreflightResponse(request) ??
      jsonResponse({ error: 'origin_not_allowed' }, 403, mcpTransportHeaders());
  }
  const baseHeaders = {
    ...mcpTransportHeaders(),
    ...mcpOriginHeaders(request),
  };
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, {
      allow: 'POST', ...baseHeaders,
    });
  }
  if (!mcpRequestAllowed(request)) {
    return jsonResponse({ error: 'request_not_allowed' }, 403, baseHeaders);
  }
  const token = await authenticateMcpToken(request, 'action');
  if (!token || !token.scopes.includes(MCP_ACTION_SCOPE)) {
    return jsonResponse({ error: 'unauthorized' }, 401, baseHeaders);
  }
  if (!await claimMcpQuota(token.id)) {
    return jsonResponse({ error: 'rate_limited' }, 429, baseHeaders);
  }
  let body: unknown;
  try {
    body = await readJsonBody(request, 32_000);
  } catch (error) {
    return rpcError(
      error instanceof SyntaxError ? -32700 : -32600,
      'Invalid Request',
      400,
      baseHeaders,
    );
  }
  const headerValue = request.headers.get('mcp-protocol-version');
  const headerVersion = headerValue ? negotiateMcpProtocol(headerValue) : null;
  if (headerValue && !headerVersion) {
    return rpcError(-32600, 'Unsupported MCP protocol version', 400, baseHeaders);
  }
  let usedTools = false;
  const statePromises = new Map<
    string,
    ReturnType<typeof loadNormalizedEmotionActionContext>
  >();
  const handler = async (message: McpRpcMessage) => {
    if (message.method === 'initialize') {
      const version = negotiateMcpProtocol(asObject(message.params)?.protocolVersion);
      if (!version) throw new McpRpcFault(-32602, 'Unsupported protocol version');
      return {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'my-emotion-map-actions', version: '1.0.0' },
      };
    }
    if (message.method === 'notifications/initialized') return {};
    if (!headerVersion) throw new McpRpcFault(-32600, 'MCP protocol header required');
    if (message.method === 'ping') return {};
    if (message.method === 'tools/list') {
      usedTools = true;
      return { tools: EMOTION_MAP_ACTION_TOOLS };
    }
    if (message.method !== 'tools/call') throw new McpRpcFault(-32601, 'Method not found');
    const params = asObject(message.params);
    const name = typeof params?.name === 'string' ? params.name : '';
    if (!EMOTION_MAP_ACTION_TOOLS.some((tool) => tool.name === name)) {
      throw new McpRpcFault(-32602, 'Unknown tool');
    }
    const validated = validateEmotionMapToolInput(name, params?.arguments ?? {});
    if (!validated.ok) throw new McpRpcFault(-32602, 'Invalid tool arguments');
    usedTools = true;
    const targetNoteId = name === 'propose_create_draft'
      ? ''
      : typeof validated.value.noteId === 'string'
        ? validated.value.noteId
        : '';
    const statePromise = statePromises.get(targetNoteId) ??
      loadNormalizedEmotionActionContext(
        normalizedAccess(token.userId),
        targetNoteId,
      );
    statePromises.set(targetNoteId, statePromise);
    const state = await statePromise;
    if (!state) return toolResult({ status: 'unavailable' }, true);
    const value = await queueEmotionMapProposal({
      token, name, input: validated.value,
      revision: state.revision, snapshot: state.snapshot,
    });
    if (!value || !validateEmotionMapToolOutput(name, value)) {
      return toolResult({ status: 'unavailable' }, true);
    }
    return toolResult(value);
  };
  const dispatched = await dispatchMcpEnvelope(body, handler);
  if (usedTools) await touchMcpToken(token);
  const headers = {
    ...mcpTransportHeaders(headerVersion ?? MCP_PROTOCOL_VERSION),
    ...mcpOriginHeaders(request),
  };
  return dispatched.body === null
    ? new Response(null, { status: dispatched.status, headers })
    : new Response(JSON.stringify(dispatched.body), { status: dispatched.status, headers });
});
