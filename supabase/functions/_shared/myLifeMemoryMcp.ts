export const MLM_SERVER_NAME = 'my-life-memory';
export const MLM_PROTOCOL_VERSION = '2025-03-26';
export const MLM_MAX_RESPONSE_BYTES = 48_000;
export const MLM_MAX_MODEL_BYTES = 12_000;
export const MLM_MANIFEST_TOOL_NAMES = [
  'research_memory_context',
  'get_memory_images',
  'search_memories',
  'list_locations',
  'get_location_memory',
  'get_day_memory',
  'get_routes',
  'summarize_memory_range',
  'export_memory_report',
] as const;

export const MLM_DEFAULT_TOOL_ALLOWLIST = new Set([
  'research_memory_context',
  'search_memories',
  'list_locations',
  'get_location_memory',
  'get_day_memory',
  'summarize_memory_range',
]);

export const configuredMlmEndpoint = (configured: string) => {
  try {
    const url = new URL(configured);
    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith('.supabase.co') ||
      url.pathname !== '/functions/v1/mcp' ||
      url.username || url.password || url.search || url.hash
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
};

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const manifestIdentity = (tools: unknown[]) => tools.flatMap((raw) => {
  const tool = asObject(raw);
  const annotations = asObject(tool?.annotations);
  return typeof tool?.name === 'string'
    ? [{ name: tool.name, readOnlyHint: annotations?.readOnlyHint === true }]
    : [];
});

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  const object = asObject(value);
  if (!object) return value;
  return Object.fromEntries(
    Object.keys(object).sort().map((key) => [key, canonicalize(object[key])]),
  );
};

export const hashMlmManifest = (tools: unknown[]) =>
  sha256Hex(JSON.stringify(canonicalize(tools)));

export type MlmHandshakeResult =
  | {
      ok: true;
      manifestHash: string;
      serverVersion: string;
      protocolVersion: string;
    }
  | {
      ok: false;
      code:
        | 'invalid_handshake'
        | 'identity_mismatch'
        | 'unsafe_manifest'
        | 'manifest_mismatch';
    };

export const validateMlmHandshake = async (
  handshake: { initialize: unknown; toolsList: unknown },
  { expectedManifestHash }: { expectedManifestHash: string },
): Promise<MlmHandshakeResult> => {
  const initialize = asObject(handshake.initialize);
  const initResult = asObject(initialize?.result);
  const serverInfo = asObject(initResult?.serverInfo);
  const toolsList = asObject(handshake.toolsList);
  const listResult = asObject(toolsList?.result);
  const tools = Array.isArray(listResult?.tools) ? listResult.tools : null;
  if (
    initialize?.jsonrpc !== '2.0' ||
    toolsList?.jsonrpc !== '2.0' ||
    typeof initResult?.protocolVersion !== 'string' ||
    typeof serverInfo?.name !== 'string' ||
    typeof serverInfo.version !== 'string' ||
    !tools
  ) return { ok: false, code: 'invalid_handshake' };
  if (serverInfo.name !== MLM_SERVER_NAME) {
    return { ok: false, code: 'identity_mismatch' };
  }
  const identity = manifestIdentity(tools);
  if (
    tools.length !== MLM_MANIFEST_TOOL_NAMES.length ||
    identity.length !== tools.length ||
    identity.some((tool, index) =>
      tool.name !== MLM_MANIFEST_TOOL_NAMES[index] || !tool.readOnlyHint) ||
    tools.some((raw) => {
      const inputSchema = asObject(asObject(raw)?.inputSchema);
      return inputSchema?.type !== 'object' ||
        inputSchema.additionalProperties !== false;
    })
  ) return { ok: false, code: 'unsafe_manifest' };
  const manifestHash = await hashMlmManifest(tools);
  if (!/^[a-f0-9]{64}$/.test(expectedManifestHash) ||
    manifestHash !== expectedManifestHash) {
    return { ok: false, code: 'manifest_mismatch' };
  }
  return {
    ok: true,
    manifestHash,
    serverVersion: serverInfo.version,
    protocolVersion: initResult.protocolVersion,
  };
};

export type ExternalMemoryEvidence = {
  key: string;
  source: 'my_life_memory_external';
  trust: 'untrusted_tool_data';
  referenceId: string;
  title: string;
  date: string;
  place: string;
  excerpt: string;
  matchReason: string;
};

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const date = (value: unknown) => {
  const candidate = text(value, 10);
  return /^20\d{2}-\d{2}-\d{2}$/.test(candidate) ? candidate : '';
};

const metricExcerpt = (item: JsonObject) => [
  ['distance', item.distance],
  ['durationSeconds', item.durationSeconds],
  ['pointCount', item.pointCount],
  ['segmentCount', item.segmentCount],
  ['noteCount', item.noteCount],
  ['count', item.count],
]
  .filter((entry): entry is [string, number] =>
    typeof entry[1] === 'number' && Number.isFinite(entry[1]))
  .slice(0, 4)
  .map(([key, value]) => `${key}: ${value}`)
  .join(' · ')
  .slice(0, 600);

const parseToolPayload = (result: unknown) => {
  const source = asObject(result);
  if (source?.structuredContent) return asObject(source.structuredContent);
  const content = Array.isArray(source?.content) ? source.content : [];
  const block = content.map(asObject).find((item) =>
    item?.type === 'text' && typeof item.text === 'string');
  if (!block || typeof block.text !== 'string' ||
    new TextEncoder().encode(block.text).byteLength > MLM_MAX_RESPONSE_BYTES) {
    return null;
  }
  try {
    return asObject(JSON.parse(block.text));
  } catch {
    return null;
  }
};

const candidatesFrom = (payload: JsonObject) => {
  const evidence = asObject(payload.evidence);
  const arrays = [
    evidence?.records,
    payload.records,
    payload.notes,
    payload.memories,
    payload.routes,
    payload.locations,
  ];
  return arrays.find(Array.isArray) as unknown[] | undefined ?? [];
};

export const normalizeMlmToolResult = (
  toolName: string,
  result: unknown,
) => {
  const payload = parseToolPayload(result);
  if (!payload) {
    return { status: 'invalid' as const, evidence: [], modelContext: null };
  }
  const verifiedPlaces = Array.isArray(asObject(payload.evidence)?.verifiedPlaceNames)
    ? (asObject(payload.evidence)?.verifiedPlaceNames as unknown[])
        .map((item) => text(item, 160)).filter(Boolean).slice(0, 3)
    : [];
  const evidence = candidatesFrom(payload)
    .map(asObject)
    .filter((item): item is JsonObject => Boolean(item))
    .slice(0, 6)
    .map((item, index): ExternalMemoryEvidence => ({
      key: `M${index + 1}`,
      source: 'my_life_memory_external',
      trust: 'untrusted_tool_data',
      referenceId: text(item.id ?? item.noteId ?? item.starId, 200) ||
        `${toolName}-${index + 1}`,
      title: text(item.title ?? item.name, 200) ||
        (toolName === 'get_routes' ? 'Saved route' : 'My Life Memory record'),
      date: date(item.localDate ?? item.date),
      place: text(item.place ?? item.location, 160) || verifiedPlaces[0] || '',
      excerpt: text(item.excerpt ?? item.summary ?? item.text, 600) ||
        metricExcerpt(item),
      matchReason: `my_life_memory:${toolName}`,
    }));
  const serialized = JSON.stringify({
    trust: 'untrusted_tool_data',
    source: 'my_life_memory_external',
    toolName,
    status: text(payload.status, 40),
    evidence,
  });
  return {
    status: evidence.length ? 'supported' as const : 'not_found' as const,
    evidence,
    modelContext: serialized.length <= MLM_MAX_MODEL_BYTES
      ? JSON.parse(serialized) as JsonObject
      : null,
  };
};
