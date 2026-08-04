import type { EmotionMapMcpToken } from './emotionMapMcpAuth.ts';
import { mcpServiceRequest } from './emotionMapMcpAuth.ts';
import { supportsEmotionMapSnapshot } from './emotionMapSnapshotBoundary.ts';

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const stableSerialize = (value: unknown) => {
  const normalize = (input: unknown): unknown => {
    if (!input || typeof input !== 'object') return input;
    if (Array.isArray(input)) return input.map(normalize);
    return Object.fromEntries(Object.entries(input as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalize(item)]));
  };
  return JSON.stringify(normalize(value));
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const normalizedProposalNoteFingerprint = (note: unknown) =>
  sha256(stableSerialize(note));

export const queueEmotionMapProposal = async ({
  token,
  name,
  input,
  revision,
  snapshot,
}: {
  token: EmotionMapMcpToken;
  name: string;
  input: JsonObject;
  revision: number;
  snapshot: unknown;
}) => {
  if (!supportsEmotionMapSnapshot(snapshot)) return null;
  const targetNoteId = name === 'propose_create_draft'
    ? ''
    : text(input.noteId, 200);
  let targetNoteFingerprint: string | null = null;
  if (targetNoteId) {
    const state = asObject(snapshot);
    const notes = state && Array.isArray(state.notes) ? state.notes : [];
    const target = notes.map(asObject).find((note) =>
      note && note.isDraft !== true && text(note.id, 200) === targetNoteId
    );
    if (!target) return null;
    targetNoteFingerprint = await normalizedProposalNoteFingerprint(target);
  }
  const clientRequestId = text(input.clientRequestId, 120);
  const toolName = `emotion_map.${name}`;
  const response = await mcpServiceRequest('/rest/v1/mcp_proposals', {
    method: 'POST',
    headers: { prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({
      user_id: token.userId,
      token_id: token.id,
      client_request_id: clientRequestId,
      tool_name: toolName,
      payload: input,
      created_against_revision: revision,
      target_note_fingerprint: targetNoteFingerprint,
    }),
  });
  if (!response?.ok) return null;
  const rows = await response.json().catch(() => []) as Array<{ id?: unknown }>;
  let proposalId = text(rows[0]?.id, 200);
  if (!proposalId) {
    const existing = await mcpServiceRequest(
      `/rest/v1/mcp_proposals?token_id=eq.${encodeURIComponent(token.id)}` +
        `&user_id=eq.${encodeURIComponent(token.userId)}` +
        `&client_request_id=eq.${encodeURIComponent(clientRequestId)}&select=id&limit=1`,
      { method: 'GET' },
    );
    const found = existing?.ok
      ? await existing.json().catch(() => []) as Array<{ id?: unknown }>
      : [];
    proposalId = text(found[0]?.id, 200);
  }
  return proposalId ? {
    status: 'queued' as const,
    proposalId,
    requiresUserConfirmation: true,
  } : null;
};
