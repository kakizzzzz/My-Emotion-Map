export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SUPPORTED_PROTOCOLS = [
  MCP_PROTOCOL_VERSION,
  '2025-03-26',
] as const;
export const MCP_MAX_BATCH = 16;

type JsonRpcId = string | number;
export type McpRpcMessage = {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

type DispatchResult = {
  status: number;
  body: unknown | null;
};

const error = (id: JsonRpcId | null, code: number, message: string) => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const legalId = (value: unknown): value is JsonRpcId =>
  (typeof value === 'string' && value.length > 0 && value.length <= 200) ||
  (typeof value === 'number' && Number.isSafeInteger(value));

const parseMessage = (value: unknown): McpRpcMessage | null => {
  if (!isObject(value) || value.jsonrpc !== '2.0' ||
    typeof value.method !== 'string' || !value.method || value.method.length > 120 ||
    (value.id !== undefined && !legalId(value.id)) ||
    Object.keys(value).some((key) => !['jsonrpc', 'id', 'method', 'params'].includes(key))) {
    return null;
  }
  return value as McpRpcMessage;
};

export class McpRpcFault extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

export const negotiateMcpProtocol = (requested: unknown) =>
  typeof requested === 'string' &&
    (MCP_SUPPORTED_PROTOCOLS as readonly string[]).includes(requested)
    ? requested as typeof MCP_SUPPORTED_PROTOCOLS[number]
    : null;

const dispatchOne = async (
  value: unknown,
  handler: (message: McpRpcMessage) => Promise<unknown>,
) => {
  const message = parseMessage(value);
  if (!message) return error(null, -32600, 'Invalid Request');
  const notification = message.id === undefined;
  if (notification !== message.method.startsWith('notifications/')) {
    return error(message.id ?? null, -32600, 'Invalid Request');
  }
  try {
    const result = await handler(message);
    return notification ? null : { jsonrpc: '2.0', id: message.id, result };
  } catch (cause) {
    if (notification) return null;
    return cause instanceof McpRpcFault
      ? error(message.id ?? null, cause.code, cause.message)
      : error(message.id ?? null, -32603, 'Internal error');
  }
};

export const dispatchMcpEnvelope = async (
  body: unknown,
  handler: (message: McpRpcMessage) => Promise<unknown>,
): Promise<DispatchResult> => {
  if (Array.isArray(body)) {
    if (!body.length || body.length > MCP_MAX_BATCH) {
      return { status: 400, body: error(null, -32600, 'Invalid Request') };
    }
    const responses = (await Promise.all(
      body.map((message) => dispatchOne(message, handler)),
    )).filter((item) => item !== null);
    return responses.length
      ? { status: 200, body: responses }
      : { status: 202, body: null };
  }
  const response = await dispatchOne(body, handler);
  return response
    ? { status: 200, body: response }
    : { status: 202, body: null };
};

export const mcpTransportHeaders = (protocolVersion = MCP_PROTOCOL_VERSION) => ({
  'content-type': 'application/json; charset=utf-8',
  'mcp-protocol-version': protocolVersion,
  'cache-control': 'no-store',
});
