import {
  configuredMlmEndpoint,
  MLM_MAX_RESPONSE_BYTES,
  MLM_PROTOCOL_VERSION,
  normalizeMlmToolResult,
  type ExternalMemoryEvidence,
} from './myLifeMemoryMcp.ts';
import { decryptMlmCredential } from './mlmCredentialCrypto.ts';
import type { SourcePlan } from './sourcePlan.ts';

type ConnectionRow = {
  credential_ciphertext: string;
  credential_iv: string;
  credential_key_version: number;
  manifest_hash: string;
  status: string;
};

export type MlmRetrievalResult = {
  status: 'supported' | 'not_found' | 'unavailable';
  evidence: ExternalMemoryEvidence[];
  modelContexts: Array<Record<string, unknown>>;
  limitation?: string;
};

const readBoundedJson = async (response: Response) => {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MLM_MAX_RESPONSE_BYTES) throw new Error('response_too_large');
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MLM_MAX_RESPONSE_BYTES) {
    throw new Error('response_too_large');
  }
  return JSON.parse(raw) as unknown;
};

const memoryQuery = (query: string) => {
  const cleaned = query.normalize('NFKC')
    .replace(/my\s*life\s*memory/gi, ' ')
    .replace(/结合|結合|一起|对照|對照|同时|同時|combine|together|alongside|함께|비교/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || query).slice(0, 1_200);
};

const toolArguments = (tool: SourcePlan['tools'][number], query: string) => {
  if (tool === 'get_routes') return { includePaths: false };
  if (tool === 'list_locations') return {};
  if (tool === 'get_day_memory') {
    const date = query.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];
    return date ? { date } : null;
  }
  if (tool === 'summarize_memory_range') return {};
  if (tool === 'search_memories') return { query: memoryQuery(query), limit: 6 };
  if (tool === 'research_memory_context') {
    return { query: memoryQuery(query), limit: 6 };
  }
  return null;
};

const callTool = async (
  endpoint: string,
  token: string,
  tool: SourcePlan['tools'][number],
  args: Record<string, unknown>,
) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'mcp-protocol-version': MLM_PROTOCOL_VERSION,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'unauthorized' : 'unavailable');
  const payload = await readBoundedJson(response);
  const result = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).result
    : null;
  if (!result) throw new Error('invalid_result');
  return result;
};

export const retrieveMyLifeMemory = async ({
  supabaseUrl,
  serviceRoleKey,
  credentialKey,
  endpoint,
  expectedManifestHash,
  userId,
  query,
  plan,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  credentialKey: string;
  endpoint: string;
  expectedManifestHash: string;
  userId: string;
  query: string;
  plan: SourcePlan;
}): Promise<MlmRetrievalResult> => {
  const fixedEndpoint = configuredMlmEndpoint(endpoint);
  if (!fixedEndpoint || !serviceRoleKey || !credentialKey ||
    !/^[a-f0-9]{64}$/.test(expectedManifestHash) ||
    plan.maxCalls === 0 || !plan.tools.length) {
    return { status: 'unavailable', evidence: [], modelContexts: [], limitation: 'my_life_memory_unavailable' };
  }
  const response = await fetch(
    `${supabaseUrl}/rest/v1/ai_mcp_connections?select=credential_ciphertext,credential_iv,credential_key_version,manifest_hash,status&user_id=eq.${encodeURIComponent(userId)}&provider=eq.my_life_memory&limit=1`,
    {
      headers: {
        authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      signal: AbortSignal.timeout(4_000),
    },
  ).catch(() => null);
  if (!response?.ok) {
    return { status: 'unavailable', evidence: [], modelContexts: [], limitation: 'my_life_memory_unavailable' };
  }
  let rows: ConnectionRow[];
  try {
    const payload = await response.json() as unknown;
    rows = Array.isArray(payload) ? payload as ConnectionRow[] : [];
  } catch {
    return { status: 'unavailable', evidence: [], modelContexts: [], limitation: 'my_life_memory_unavailable' };
  }
  const row = rows[0];
  if (!row || row.status !== 'connected' ||
    row.manifest_hash !== expectedManifestHash) {
    return { status: 'unavailable', evidence: [], modelContexts: [], limitation: 'my_life_memory_not_connected' };
  }
  try {
    const token = await decryptMlmCredential({
      ciphertext: row.credential_ciphertext,
      iv: row.credential_iv,
      keyVersion: row.credential_key_version as 1,
    }, credentialKey);
    const evidence: ExternalMemoryEvidence[] = [];
    const modelContexts: Array<Record<string, unknown>> = [];
    for (const tool of plan.tools.slice(0, plan.maxCalls)) {
      const args = toolArguments(tool, query);
      if (!args) continue;
      const result = normalizeMlmToolResult(
        tool,
        await callTool(fixedEndpoint, token, tool, args),
      );
      evidence.push(...result.evidence.map((item, index) => ({
        ...item,
        key: `M${evidence.length + index + 1}`,
      })));
      if (result.modelContext) modelContexts.push(result.modelContext);
      if (evidence.length >= 6) break;
    }
    return {
      status: evidence.length ? 'supported' : 'not_found',
      evidence: evidence.slice(0, 6),
      modelContexts: modelContexts.slice(0, 2),
      ...(evidence.length ? {} : { limitation: 'my_life_memory_no_match' }),
    };
  } catch {
    return { status: 'unavailable', evidence: [], modelContexts: [], limitation: 'my_life_memory_unavailable' };
  }
};
