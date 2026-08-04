import { env, jsonResponse, readJsonBody, runtime } from '../_shared/runtime.ts';
import {
  authenticateMcpToken,
  claimMcpQuota,
  mcpOriginHeaders,
  mcpPreflightResponse,
  mcpRequestAllowed,
  touchMcpToken,
} from '../_shared/emotionMapMcpAuth.ts';
import {
  EMOTION_MAP_READ_TOOLS,
  listEmotionMapReadTools,
} from '../_shared/emotionMapMcpManifest.ts';
import { executeEmotionMapReadTool } from '../_shared/emotionMapMcpReadTools.ts';
import {
  validateEmotionMapToolInput,
  validateEmotionMapToolOutput,
} from '../_shared/emotionMapMcpValidation.ts';
import {
  MCP_PROTOCOL_VERSION,
  McpRpcFault,
  dispatchMcpEnvelope,
  mcpTransportHeaders,
  negotiateMcpProtocol,
  type McpRpcMessage,
} from '../_shared/mcpTransport.ts';
import {
  loadNormalizedEmotionReadContext,
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
) =>
  jsonResponse({
    jsonrpc: '2.0', id: null, error: { code, message },
  }, status, headers);

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
  const token = await authenticateMcpToken(request, 'output');
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401, baseHeaders);
  if (!await claimMcpQuota(token.id)) {
    return jsonResponse({ error: 'rate_limited' }, 429, baseHeaders);
  }
  let body: unknown;
  try {
    body = await readJsonBody(request, 64_000);
  } catch (error) {
    return rpcError(
      error instanceof SyntaxError ? -32700 : -32600,
      error instanceof SyntaxError ? 'Parse error' : 'Invalid Request',
      error instanceof SyntaxError ? 400 : 413,
      baseHeaders,
    );
  }
  const headerVersionValue = request.headers.get('mcp-protocol-version');
  const headerVersion = headerVersionValue
    ? negotiateMcpProtocol(headerVersionValue)
    : null;
  if (headerVersionValue && !headerVersion) {
    return rpcError(-32600, 'Unsupported MCP protocol version', 400, baseHeaders);
  }
  let usedTools = false;
  let statePromise: ReturnType<typeof loadNormalizedEmotionReadContext> | null = null;
  const handler = async (message: McpRpcMessage) => {
    if (message.method === 'initialize') {
      const params = asObject(message.params);
      const negotiated = negotiateMcpProtocol(params?.protocolVersion);
      if (!negotiated) throw new McpRpcFault(-32602, 'Unsupported protocol version');
      return {
        protocolVersion: negotiated,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'my-emotion-map', version: '1.0.0' },
      };
    }
    if (message.method === 'notifications/initialized') return {};
    if (!headerVersion) throw new McpRpcFault(-32600, 'MCP protocol header required');
    if (message.method === 'ping') return {};
    if (message.method === 'tools/list') {
      usedTools = true;
      return { tools: listEmotionMapReadTools(token.scopes) };
    }
    if (message.method !== 'tools/call') {
      throw new McpRpcFault(-32601, 'Method not found');
    }
    const params = asObject(message.params);
    const name = typeof params?.name === 'string' ? params.name : '';
    if (!EMOTION_MAP_READ_TOOLS.some((tool) => tool.name === name) ||
      !listEmotionMapReadTools(token.scopes).some((tool) => tool.name === name)) {
      throw new McpRpcFault(-32602, 'Unknown or unavailable tool');
    }
    const validated = validateEmotionMapToolInput(name, params?.arguments ?? {});
    if (!validated.ok) throw new McpRpcFault(-32602, 'Invalid tool arguments');
    usedTools = true;
    statePromise ??= loadNormalizedEmotionReadContext(normalizedAccess(token.userId));
    const state = await statePromise;
    if (!state) return toolResult({ status: 'unavailable' }, true);
    const value = await executeEmotionMapReadTool({
      token,
      snapshot: state.snapshot,
      name,
      input: validated.value,
      continuationSecret: env('MCP_CONTINUATION_SECRET'),
    });
    if (!value || !validateEmotionMapToolOutput(name, value)) {
      return toolResult({ status: 'unavailable' }, true);
    }
    return toolResult(value);
  };
  const dispatched = await dispatchMcpEnvelope(body, handler);
  if (usedTools) await touchMcpToken(token);
  const protocolVersion = headerVersion ?? MCP_PROTOCOL_VERSION;
  const headers = {
    ...mcpTransportHeaders(protocolVersion),
    ...mcpOriginHeaders(request),
  };
  if (dispatched.body === null) {
    return new Response(null, { status: dispatched.status, headers });
  }
  const encoded = JSON.stringify(dispatched.body);
  if (new TextEncoder().encode(encoded).byteLength > 512_000) {
    return rpcError(-32603, 'Response too large', 500, headers);
  }
  return new Response(encoded, { status: dispatched.status, headers });
});
