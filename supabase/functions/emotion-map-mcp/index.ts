import { env, jsonResponse, readJsonBody, runtime } from '../_shared/runtime.ts';
import {
  canCallMcpTool,
  isMcpOwner,
} from '../_shared/mcpValidation.ts';

type JsonRpcId = string | number | null;
type RpcRequest = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
type TokenRow = {
  id: string;
  user_id: string;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
};
type SavedRecord = {
  id: string;
  title: string;
  place: string;
  date: string;
  time: string;
  emotion: string | null;
  excerpt: string;
  answers: Array<{ answer?: unknown }>;
  latitude?: number;
  longitude?: number;
};

const PROTOCOL_VERSION = '2025-06-18';
const serviceHeaders = () => ({
  apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
  authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
  'content-type': 'application/json',
});
const rpcResult = (id: JsonRpcId, result: unknown) =>
  jsonResponse({ jsonrpc: '2.0', id, result });
const rpcError = (id: JsonRpcId, code: number, message: string, status = 200) =>
  jsonResponse({ jsonrpc: '2.0', id, error: { code, message } }, status);
const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const stableSerialize = (value: unknown) => {
  const normalize = (input: unknown): unknown => {
    if (!input || typeof input !== 'object') return input;
    if (Array.isArray(input)) return input.map(normalize);
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]),
    );
  };
  return JSON.stringify(normalize(value));
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const authenticateToken = async (request: Request): Promise<TokenRow | null> => {
  const raw = request.headers.get('authorization') ?? '';
  if (!/^Bearer mem_[a-f0-9]{64}$/.test(raw)) return null;
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = env('SUPABASE_URL');
  if (!serviceKey || !supabaseUrl) return null;
  const hash = await sha256(raw.slice(7));
  const response = await fetch(
    `${supabaseUrl}/rest/v1/mcp_tokens?token_hash=eq.${hash}` +
      '&select=id,user_id,scopes,expires_at,revoked_at&limit=1',
    { headers: serviceHeaders(), signal: AbortSignal.timeout(8_000) },
  );
  if (!response.ok) return null;
  const rows = await response.json() as TokenRow[];
  const token = rows[0];
  if (!token || token.revoked_at || Date.parse(token.expires_at) <= Date.now()) return null;
  return token;
};

const claimQuota = async (tokenId: string) => {
  const response = await fetch(
    `${env('SUPABASE_URL')}/rest/v1/rpc/claim_mcp_quota`,
    {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ p_token_id: tokenId }),
      signal: AbortSignal.timeout(8_000),
    },
  );
  return response.ok && await response.json() === true;
};

const loadRecords = async (token: TokenRow): Promise<SavedRecord[] | null> => {
  const response = await fetch(
    `${env('SUPABASE_URL')}/rest/v1/app_states?user_id=eq.${token.user_id}` +
      '&select=user_id,payload&limit=1',
    { headers: serviceHeaders(), signal: AbortSignal.timeout(8_000) },
  );
  if (!response.ok) return null;
  const rows = await response.json() as Array<{ user_id?: unknown; payload?: unknown }>;
  if (rows[0]?.user_id !== undefined && !isMcpOwner(token.user_id, rows[0].user_id)) return null;
  const snapshot = asObject(rows[0]?.payload);
  if (!snapshot || snapshot.dataMode !== 'real') return [];
  const notes = Array.isArray(snapshot.notes) ? snapshot.notes : [];
  const moments = Array.isArray(snapshot.moments) ? snapshot.moments : [];
  const momentByNote = new Map<string, Record<string, unknown>>();
  for (const value of moments) {
    const moment = asObject(value);
    if (!moment || moment.isNew === true || moment.isInboxDraft === true) continue;
    const noteId = text(moment.noteId, 200);
    if (noteId && !momentByNote.has(noteId)) momentByNote.set(noteId, moment);
  }
  return notes.flatMap((value): SavedRecord[] => {
    const note = asObject(value);
    if (!note || note.isDraft === true) return [];
    const id = text(note.id, 200);
    const moment = momentByNote.get(id);
    if (!id || !moment) return [];
    return [{
      id,
      title: text(note.title, 500),
      place: text(note.place, 500),
      date: text(note.localDate || note.date, 10),
      time: text(note.localTime || note.time, 5),
      emotion: typeof note.emotion === 'string' ? note.emotion : null,
      excerpt: text(note.excerpt, 2_000),
      answers: Array.isArray(note.answers)
        ? note.answers.map(asObject).filter((item): item is Record<string, unknown> => Boolean(item))
        : [],
      latitude: typeof moment.latitude === 'number' ? moment.latitude : undefined,
      longitude: typeof moment.longitude === 'number' ? moment.longitude : undefined,
    }];
  });
};

const publicRecord = (record: SavedRecord, roundedCoordinates: boolean) => ({
  noteId: record.id,
  title: record.title,
  place: record.place,
  date: record.date,
  time: record.time,
  emotion: record.emotion,
  excerpt: record.excerpt,
  ...(roundedCoordinates && record.latitude !== undefined && record.longitude !== undefined
    ? {
        latitude: Math.round(record.latitude * 100) / 100,
        longitude: Math.round(record.longitude * 100) / 100,
      }
    : {}),
});

const toolDefinitions = [
  { name: 'emotion_map.get_capabilities', description: 'Show scopes and privacy defaults.', inputSchema: { type: 'object', additionalProperties: false } },
  { name: 'emotion_map.search_records', description: 'Search the owner\'s saved records.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, startDate: { type: 'string' }, endDate: { type: 'string' }, place: { type: 'string' }, emotion: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 }, coordinates: { enum: ['none', 'rounded'] } }, additionalProperties: false } },
  { name: 'emotion_map.get_record', description: 'Read one owner-scoped saved record.', inputSchema: { type: 'object', properties: { noteId: { type: 'string' } }, required: ['noteId'], additionalProperties: false } },
  { name: 'emotion_map.summarize_range', description: 'Return deterministic counts only.', inputSchema: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, groupBy: { enum: ['date', 'place', 'emotion'] } }, required: ['startDate', 'endDate', 'groupBy'], additionalProperties: false } },
  { name: 'emotion_map.list_places', description: 'List place labels and counts without coordinates.', inputSchema: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50 } }, additionalProperties: false } },
  { name: 'emotion_map.propose_create_draft', description: 'Queue a draft proposal for in-app confirmation.', inputSchema: { type: 'object', properties: { clientRequestId: { type: 'string' }, title: { type: 'string' }, localDate: { type: 'string' }, localTime: { type: 'string' }, place: { type: 'string' }, text: { type: 'string' }, emotion: { type: 'string' } }, required: ['clientRequestId'], additionalProperties: false } },
  { name: 'emotion_map.propose_append_note', description: 'Queue an append proposal for in-app confirmation.', inputSchema: { type: 'object', properties: { clientRequestId: { type: 'string' }, noteId: { type: 'string' }, text: { type: 'string' } }, required: ['clientRequestId', 'noteId', 'text'], additionalProperties: false } },
  { name: 'emotion_map.propose_schedule_followup', description: 'Queue a follow-up proposal for in-app confirmation.', inputSchema: { type: 'object', properties: { clientRequestId: { type: 'string' }, noteId: { type: 'string' }, intervalDays: { enum: [1, 3, 7] } }, required: ['clientRequestId', 'noteId', 'intervalDays'], additionalProperties: false } },
  { name: 'emotion_map.open_record', description: 'Return a local deep link without changing data.', inputSchema: { type: 'object', properties: { noteId: { type: 'string' } }, required: ['noteId'], additionalProperties: false } },
];

const matchesRange = (record: SavedRecord, input: Record<string, unknown>) =>
  (!text(input.startDate, 10) || record.date >= text(input.startDate, 10)) &&
  (!text(input.endDate, 10) || record.date <= text(input.endDate, 10));

const queueProposal = async (
  token: TokenRow,
  name: string,
  input: Record<string, unknown>,
) => {
  const clientRequestId = text(input.clientRequestId, 120);
  if (!clientRequestId) return { error: 'invalid_request' };
  const stateResponse = await fetch(
    `${env('SUPABASE_URL')}/rest/v1/app_states?user_id=eq.${token.user_id}` +
      '&select=revision,payload&limit=1',
    { headers: serviceHeaders(), signal: AbortSignal.timeout(8_000) },
  );
  if (!stateResponse.ok) return { error: 'unavailable' };
  const stateRows = await stateResponse.json() as Array<{
    revision?: unknown;
    payload?: unknown;
  }>;
  const createdAgainstRevision = stateRows.length
    ? Number(stateRows[0]?.revision)
    : 0;
  if (!Number.isSafeInteger(createdAgainstRevision) || createdAgainstRevision < 0) {
    return { error: 'unavailable' };
  }
  const targetNoteId = name === 'emotion_map.propose_create_draft'
    ? ''
    : text(input.noteId, 200);
  let targetNoteFingerprint: string | null = null;
  if (targetNoteId) {
    const snapshot = asObject(stateRows[0]?.payload);
    const notes = snapshot && Array.isArray(snapshot.notes) ? snapshot.notes : [];
    const target = notes
      .map(asObject)
      .find((note) => note && note.isDraft !== true && text(note.id, 200) === targetNoteId);
    if (!target) return { error: 'not_found' };
    targetNoteFingerprint = await sha256(stableSerialize(target));
  }
  const response = await fetch(`${env('SUPABASE_URL')}/rest/v1/mcp_proposals`, {
    method: 'POST',
    headers: { ...serviceHeaders(), prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({
      user_id: token.user_id,
      token_id: token.id,
      client_request_id: clientRequestId,
      tool_name: name,
      payload: input,
      created_against_revision: createdAgainstRevision,
      target_note_fingerprint: targetNoteFingerprint,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return { error: 'unavailable' };
  const rows = await response.json() as Array<{ id?: unknown }>;
  const proposalId = text(rows[0]?.id, 200);
  if (proposalId) return { proposalId, requiresUserConfirmation: true };
  const existing = await fetch(
    `${env('SUPABASE_URL')}/rest/v1/mcp_proposals?token_id=eq.${token.id}` +
      `&client_request_id=eq.${encodeURIComponent(clientRequestId)}&select=id&limit=1`,
    { headers: serviceHeaders(), signal: AbortSignal.timeout(8_000) },
  );
  const found = existing.ok ? await existing.json() as Array<{ id?: unknown }> : [];
  return { proposalId: text(found[0]?.id, 200), requiresUserConfirmation: true };
};

const callTool = async (token: TokenRow, name: string, input: Record<string, unknown>) => {
  const writeTool = name.startsWith('emotion_map.propose_');
  if (!canCallMcpTool(token.scopes, name)) return { error: 'scope_denied' };
  if (name === 'emotion_map.get_capabilities') {
    return { schemaVersion: 4, scopes: token.scopes, limits: { records: 20 }, exactCoordinates: false };
  }
  if (writeTool) return queueProposal(token, name, input);
  const records = await loadRecords(token);
  if (!records) return { status: 'unavailable' };
  if (name === 'emotion_map.open_record') {
    const noteId = text(input.noteId, 200);
    return records.some((record) => record.id === noteId)
      ? { deepLink: `/?note=${encodeURIComponent(noteId)}` }
      : { status: 'not_found' };
  }
  if (name === 'emotion_map.get_record') {
    const record = records.find((item) => item.id === text(input.noteId, 200));
    return record ? publicRecord(record, false) : { status: 'not_found' };
  }
  const ranged = records.filter((record) => matchesRange(record, input));
  if (name === 'emotion_map.list_places') {
    const counts = new Map<string, number>();
    ranged.forEach((record) => counts.set(record.place, (counts.get(record.place) ?? 0) + 1));
    return [...counts].map(([place, count]) => ({ place, count }))
      .sort((left, right) => right.count - left.count || left.place.localeCompare(right.place))
      .slice(0, Math.min(50, Math.max(1, Number(input.limit) || 20)));
  }
  if (name === 'emotion_map.summarize_range') {
    const groupBy = text(input.groupBy, 10) as 'date' | 'place' | 'emotion';
    const counts = new Map<string, number>();
    ranged.forEach((record) => {
      const key = groupBy === 'date' ? record.date : groupBy === 'place' ? record.place : record.emotion ?? 'unknown';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return { total: ranged.length, groups: [...counts].map(([key, count]) => ({ key, count })) };
  }
  if (name === 'emotion_map.search_records') {
    const query = text(input.query, 300).toLocaleLowerCase();
    const place = text(input.place, 500).toLocaleLowerCase();
    const emotion = text(input.emotion, 40);
    const filtered = ranged.filter((record) =>
      (!place || record.place.toLocaleLowerCase().includes(place)) &&
      (!emotion || record.emotion === emotion) &&
      (!query || [record.title, record.place, record.excerpt, ...record.answers.map((answer) => text(answer.answer, 1_000))]
        .join(' ').toLocaleLowerCase().includes(query))
    );
    const rounded = input.coordinates === 'rounded' && token.scopes.includes('coordinates:rounded');
    return {
      status: filtered.length ? 'supported' : 'not_found',
      records: filtered.slice(0, Math.min(20, Math.max(1, Number(input.limit) || 6)))
        .map((record) => publicRecord(record, rounded)),
    };
  }
  return { error: 'unknown_tool' };
};

runtime.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const token = await authenticateToken(request);
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401);
  if (!await claimQuota(token.id)) return jsonResponse({ error: 'rate_limited' }, 429);
  let body: unknown;
  try {
    body = await readJsonBody(request, 32_000);
  } catch {
    return rpcError(null, -32700, 'Parse error', 400);
  }
  const message = asObject(body) as RpcRequest | null;
  const id = typeof message?.id === 'string' || typeof message?.id === 'number' || message?.id === null
    ? message.id as JsonRpcId
    : null;
  if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(id, -32600, 'Invalid Request', 400);
  }
  if (message.method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'my-emotion-map', version: '0.4.0' },
    });
  }
  if (message.method === 'notifications/initialized') return new Response(null, { status: 202 });
  if (message.method === 'tools/list') return rpcResult(id, { tools: toolDefinitions });
  if (message.method !== 'tools/call') return rpcError(id, -32601, 'Method not found');
  const params = asObject(message.params);
  const name = text(params?.name, 120);
  const input = asObject(params?.arguments) ?? {};
  if (!toolDefinitions.some((tool) => tool.name === name)) return rpcError(id, -32602, 'Unknown tool');
  try {
    const value = await callTool(token, name, input);
    return rpcResult(id, {
      content: [{ type: 'text', text: JSON.stringify(value) }],
      structuredContent: value,
      isError: asObject(value)?.error !== undefined,
    });
  } catch {
    return rpcResult(id, {
      content: [{ type: 'text', text: JSON.stringify({ status: 'unavailable' }) }],
      structuredContent: { status: 'unavailable' },
      isError: true,
    });
  }
});
