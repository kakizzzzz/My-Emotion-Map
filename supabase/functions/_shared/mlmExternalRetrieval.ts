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
  modelImages: MlmModelImage[];
  calls: MlmCallReference[];
  limitation?: string;
};

export type MlmCallReference = {
  server: 'my_life_memory';
  toolName: SourcePlan['tools'][number];
  status: 'completed' | 'not_found' | 'unavailable';
};

export type MlmModelImage = {
  dataUrl: string;
  evidenceKeys: string[];
};

const MLM_MAX_IMAGE_RESPONSE_BYTES = 7_000_000;
const MLM_MAX_MODEL_IMAGES = 2;
const MLM_MAX_IMAGE_BYTES = 2_500_000;
const MLM_MAX_TOTAL_IMAGE_BYTES = 5_000_000;
const SUPPORTED_IMAGE_MIME = /^image\/(?:jpeg|png|webp|gif)$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const readBoundedJson = async (response: Response, maxBytes: number) => {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error('response_too_large');
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new Error('response_too_large');
  }
  return JSON.parse(raw) as unknown;
};

const memoryQuery = (query: string) => {
  const cleaned = query.normalize('NFKC')
    .replace(/my\s*life\s*memory/gi, ' ')
    .replace(/(?:调用|使用|用)\s*(?:一下\s*)?mcp/gi, ' ')
    .replace(/\bmcp\b/gi, ' ')
    .replace(/结合|結合|一起|对照|對照|同时|同時|combine|together|alongside|함께|비교/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || query).slice(0, 1_200);
};

const toolArguments = (
  tool: SourcePlan['tools'][number],
  query: string,
  selectedImageNoteIds: string[],
  selectedLocationStarIds: string[],
) => {
  if (tool === 'get_memory_images') {
    return selectedImageNoteIds.length
      ? { noteIds: selectedImageNoteIds.slice(0, 10), maxImages: MLM_MAX_MODEL_IMAGES }
      : null;
  }
  if (tool === 'get_routes') return { includePaths: false };
  if (tool === 'list_locations') return {};
  if (tool === 'get_location_memory') {
    return selectedLocationStarIds[0]
      ? { starId: selectedLocationStarIds[0] }
      : null;
  }
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
  const imageRequest = tool === 'get_memory_images';
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
    signal: AbortSignal.timeout(imageRequest ? 14_000 : 12_000),
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'unauthorized' : 'unavailable');
  const payload = await readBoundedJson(
    response,
    imageRequest ? MLM_MAX_IMAGE_RESPONSE_BYTES : MLM_MAX_RESPONSE_BYTES,
  );
  const result = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).result
    : null;
  if (!result) throw new Error('invalid_result');
  return result;
};

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const decodedBase64Bytes = (value: string) => {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor(value.length * 3 / 4) - padding;
};

export const extractMlmModelImages = ({
  result,
  selectedImageNoteIds,
  evidence,
}: {
  result: unknown;
  selectedImageNoteIds: string[];
  evidence: ExternalMemoryEvidence[];
}): MlmModelImage[] => {
  const source = object(result);
  const content = Array.isArray(source?.content) ? source.content : [];
  const blocks = content.map(object).filter(
    (item): item is Record<string, unknown> => Boolean(item),
  );
  const summaryText = blocks.find((item) =>
    item.type === 'text' && typeof item.text === 'string'
  )?.text;
  if (typeof summaryText !== 'string' || summaryText.length > 80_000) return [];
  let summary: Record<string, unknown> | null = null;
  try {
    summary = object(JSON.parse(summaryText));
  } catch {
    return [];
  }
  const metadata = Array.isArray(summary?.images)
    ? summary.images.map(object).filter(
        (item): item is Record<string, unknown> => Boolean(item),
      )
    : [];
  const imageBlocks = blocks.filter((item) => item.type === 'image');
  const authorizedIds = new Set(selectedImageNoteIds);
  const evidenceKeyByReference = new Map(
    evidence.map((item) => [item.referenceId, item.key]),
  );
  const accepted: MlmModelImage[] = [];
  let totalBytes = 0;
  for (let index = 0; index < Math.min(
    metadata.length,
    imageBlocks.length,
    MLM_MAX_MODEL_IMAGES,
  ); index += 1) {
    const image = imageBlocks[index];
    const meta = metadata[index];
    const mimeType = typeof image.mimeType === 'string'
      ? image.mimeType.trim().toLowerCase()
      : '';
    const data = typeof image.data === 'string' ? image.data.trim() : '';
    const noteIds = Array.isArray(meta.noteIds)
      ? meta.noteIds.filter(
          (item): item is string => typeof item === 'string' && authorizedIds.has(item),
        )
      : [];
    const evidenceKeys = [...new Set(noteIds.flatMap((noteId) => {
      const key = evidenceKeyByReference.get(noteId);
      return key ? [key] : [];
    }))];
    if (!SUPPORTED_IMAGE_MIME.test(mimeType) || !data ||
      data.length > Math.ceil(MLM_MAX_IMAGE_BYTES * 4 / 3) + 4 ||
      data.length % 4 !== 0 || !BASE64.test(data) || !evidenceKeys.length) continue;
    const byteLength = decodedBase64Bytes(data);
    if (byteLength <= 0 || byteLength > MLM_MAX_IMAGE_BYTES ||
      totalBytes + byteLength > MLM_MAX_TOTAL_IMAGE_BYTES) continue;
    totalBytes += byteLength;
    accepted.push({
      dataUrl: `data:${mimeType};base64,${data}`,
      evidenceKeys,
    });
  }
  return accepted;
};

const emptyResult = (
  limitation: string,
  plan: SourcePlan,
): MlmRetrievalResult => ({
  status: 'unavailable',
  evidence: [],
  modelContexts: [],
  modelImages: [],
  calls: plan.tools[0]
    ? [{
        server: 'my_life_memory',
        toolName: plan.tools[0],
        status: 'unavailable',
      }]
    : [],
  limitation,
});

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
    return emptyResult('my_life_memory_unavailable', plan);
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
    return emptyResult('my_life_memory_unavailable', plan);
  }
  let rows: ConnectionRow[];
  try {
    const payload = await response.json() as unknown;
    rows = Array.isArray(payload) ? payload as ConnectionRow[] : [];
  } catch {
    return emptyResult('my_life_memory_unavailable', plan);
  }
  const row = rows[0];
  if (!row || row.status !== 'connected' ||
    row.manifest_hash !== expectedManifestHash) {
    return emptyResult('my_life_memory_not_connected', plan);
  }
  try {
    const token = await decryptMlmCredential({
      ciphertext: row.credential_ciphertext,
      iv: row.credential_iv,
      keyVersion: row.credential_key_version as 1,
    }, credentialKey);
    const evidence: ExternalMemoryEvidence[] = [];
    const modelContexts: Array<Record<string, unknown>> = [];
    const modelImages: MlmModelImage[] = [];
    const calls: MlmCallReference[] = [];
    let locationDiscoveryEvidence: ExternalMemoryEvidence[] = [];
    let selectedImageNoteIds: string[] = [];
    let selectedLocationStarIds: string[] = [];
    let limitation: string | undefined;
    const plannedTools = plan.tools.slice(0, plan.maxCalls);
    for (let toolIndex = 0; toolIndex < plannedTools.length; toolIndex += 1) {
      const tool = plannedTools[toolIndex];
      const args = toolArguments(
        tool,
        query,
        selectedImageNoteIds,
        selectedLocationStarIds,
      );
      if (!args) continue;
      let rawResult: unknown;
      try {
        rawResult = await callTool(fixedEndpoint, token, tool, args);
      } catch {
        calls.push({ server: 'my_life_memory', toolName: tool, status: 'unavailable' });
        const nextTool = plannedTools[toolIndex + 1];
        const hasIndependentNextTool = Boolean(nextTool && nextTool !== 'get_memory_images');
        if (tool === 'research_memory_context' && !hasIndependentNextTool &&
          calls.length < 2) {
          const fallbackTool = 'search_memories' as const;
          try {
            const fallbackResult = await callTool(
              fixedEndpoint,
              token,
              fallbackTool,
              {
                query: plan.searchQuery || memoryQuery(query),
                limit: 6,
              },
            );
            const normalized = normalizeMlmToolResult(
              fallbackTool,
              fallbackResult,
            );
            const nextEvidence = normalized.evidence.map((item, index) => ({
              ...item,
              key: `M${evidence.length + index + 1}`,
            }));
            evidence.push(...nextEvidence);
            selectedImageNoteIds = normalized.selectedImageNoteIds.filter(
              (noteId) => evidence.some((item) => item.referenceId === noteId),
            );
            calls.push({
              server: 'my_life_memory',
              toolName: fallbackTool,
              status: normalized.evidence.length ? 'completed' : 'not_found',
            });
            if (normalized.modelContext) {
              modelContexts.push(normalized.modelContext);
            }
          } catch {
            calls.push({
              server: 'my_life_memory',
              toolName: fallbackTool,
              status: 'unavailable',
            });
          }
        }
        limitation = tool === 'get_memory_images'
          ? 'my_life_memory_images_unavailable'
          : evidence.length ? undefined : 'my_life_memory_unavailable';
        if (hasIndependentNextTool) continue;
        break;
      }
      if (tool === 'get_memory_images') {
        const images = extractMlmModelImages({
          result: rawResult,
          selectedImageNoteIds,
          evidence,
        });
        modelImages.push(...images);
        calls.push({
          server: 'my_life_memory',
          toolName: tool,
          status: images.length ? 'completed' : 'not_found',
        });
        continue;
      }
      const result = normalizeMlmToolResult(tool, rawResult);
      const nextEvidence = result.evidence.map((item, index) => ({
        ...item,
        key: `M${evidence.length + index + 1}`,
      }));
      if (tool === 'list_locations' &&
        plannedTools[toolIndex + 1] === 'get_location_memory') {
        locationDiscoveryEvidence = nextEvidence;
      } else {
        evidence.push(...nextEvidence);
      }
      selectedImageNoteIds = result.selectedImageNoteIds.filter((noteId) =>
        evidence.some((item) => item.referenceId === noteId)
      );
      selectedLocationStarIds = result.selectedLocationStarIds;
      calls.push({
        server: 'my_life_memory',
        toolName: tool,
        status: result.evidence.length ? 'completed' : 'not_found',
      });
      if (result.modelContext) modelContexts.push(result.modelContext);
    }
    if (!evidence.length && locationDiscoveryEvidence[0]) {
      evidence.push({ ...locationDiscoveryEvidence[0], key: 'M1' });
    }
    return {
      status: evidence.length
        ? 'supported'
        : limitation ? 'unavailable' : 'not_found',
      evidence: evidence.slice(0, 6),
      modelContexts: modelContexts.slice(0, 2),
      modelImages: modelImages.slice(0, MLM_MAX_MODEL_IMAGES),
      calls: calls.slice(0, 2),
      ...(limitation
        ? { limitation }
        : evidence.length ? {} : { limitation: 'my_life_memory_no_match' }),
    };
  } catch {
    return emptyResult('my_life_memory_unavailable', plan);
  }
};
