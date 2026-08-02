import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppLanguage } from '../i18n';
import { createRecord } from '../app/recordFactory';
import { createFollowUpForNote } from '../domain/followUps';
import type {
  AppDataSnapshot,
  DataMode,
  EmotionKey,
  EmotionNote,
  HealthPreferences,
} from '../types';
import type { UserLocation } from '../useLocationController';
import type { McpProposal } from '../features/settings/settingsTypes';
import { stableSerialize } from '../app/workspace/workspaceStorage';
import {
  classifyProposalJournal,
  clearProposalJournal,
  findProposalJournal,
  markProposalLocallyApplied,
  stageProposalApplication,
} from './proposalApplication';
import { createShortcutAccessHandlers } from './shortcutAccess';
import { createMyLifeMemoryConnectionHandlers } from './myLifeMemoryConnection';

const EMOTIONS = new Set<EmotionKey>([
  'calm', 'joy', 'tender', 'curious', 'energized', 'connected',
  'heavy', 'restless', 'focused', 'overwhelmed', 'numb', 'mixed',
]);
export type McpOutputStatus = {
  scope: 'records:read';
  expiresAt: string;
  lastUsedAt: string | null;
};
const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const proposalNoteFingerprint = (note: EmotionNote) =>
  sha256(stableSerialize(note));

export const createExternalAccessHandlers = ({
  client,
  userId,
  dataMode,
  healthPreferences,
  userLocation,
  language,
  snapshot,
  cloudRevision,
  applySnapshot,
  onDraftCreated,
  onRequireLocation,
}: {
  client: SupabaseClient | null;
  userId: string | null;
  dataMode: DataMode;
  healthPreferences: HealthPreferences;
  userLocation: UserLocation | null;
  language: AppLanguage;
  snapshot: AppDataSnapshot;
  cloudRevision: number | null;
  applySnapshot: (snapshot: AppDataSnapshot) => void;
  onDraftCreated: (momentId: string) => void;
  onRequireLocation: () => void;
}) => {
  const available = Boolean(client && userId && dataMode === 'real');
  const appliedThisSession = new Set<string>();
  const shortcutAccess = createShortcutAccessHandlers({
    client,
    userId,
    available,
    preferences: healthPreferences,
  });
  const myLifeMemoryConnection = createMyLifeMemoryConnectionHandlers({
    client,
    available,
  });
  const issueMcpToken = async () => {
    if (!client || !available) return null;
    const { data, error } = await client.rpc('issue_mcp_token', {
      p_kind: 'output',
      p_ttl_hours: 24,
    });
    const row = Array.isArray(data) ? data[0] : data;
    return !error && row && typeof row.token === 'string' &&
      typeof row.expires_at === 'string'
      ? { token: row.token, expiresAt: row.expires_at }
      : null;
  };

  const revokeAllMcpTokens = async () => {
    if (!client || !userId) return false;
    const { error } = await client.rpc('revoke_mcp_tokens', {
      p_kind: 'output',
    });
    return !error;
  };

  const getMcpOutputStatus = async (): Promise<McpOutputStatus | null> => {
    if (!client || !userId || !available) return null;
    const { data, error } = await client
      .from('mcp_tokens')
      .select('kind,scopes,expires_at,last_used_at,revoked_at')
      .eq('kind', 'output')
      .order('created_at', { ascending: false })
      .limit(1);
    const row = !error && Array.isArray(data) ? data[0] : null;
    return row?.kind === 'output' && row.revoked_at === null &&
      Array.isArray(row.scopes) && row.scopes.includes('records:read') &&
      typeof row.expires_at === 'string'
      ? {
          scope: 'records:read',
          expiresAt: row.expires_at,
          lastUsedAt: typeof row.last_used_at === 'string'
            ? row.last_used_at
            : null,
        }
      : null;
  };

  const listMcpProposals = async (): Promise<McpProposal[]> => {
    if (!client || !available) return [];
    const { data, error } = await client
      .from('mcp_proposals')
      .select('id,tool_name,payload,created_at,status,created_against_revision,target_note_fingerprint')
      .in('status', ['queued', 'accepting'])
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data)) return [];
    return data.flatMap((row): McpProposal[] =>
      typeof row.id === 'string' && typeof row.tool_name === 'string' &&
      row.payload && typeof row.payload === 'object' &&
      typeof row.created_at === 'string' &&
      (row.status === 'queued' || row.status === 'accepting')
        ? [{
            id: row.id,
            toolName: row.tool_name,
            payload: row.payload as Record<string, unknown>,
            createdAt: row.created_at,
            status: row.status,
            createdAgainstRevision: Number.isSafeInteger(Number(row.created_against_revision))
              ? Number(row.created_against_revision)
              : null,
            targetNoteFingerprint: typeof row.target_note_fingerprint === 'string'
              ? row.target_note_fingerprint
              : null,
          }]
        : [],
    );
  };

  const resolveMcpProposal = async (
    proposal: McpProposal,
    decision: 'accepted' | 'rejected',
  ) => {
    if (!client || !available) return false;
    if (decision === 'rejected') {
      const { data, error } = await client.rpc('reject_mcp_proposal', {
        p_proposal_id: proposal.id,
      });
      const row = Array.isArray(data) ? data[0] : data;
      return !error && row?.status === 'rejected';
    }

    const payload = proposal.payload;
    const targetNoteId = proposal.toolName === 'emotion_map.propose_create_draft'
      ? ''
      : text(payload.noteId, 200);
    const targetNote = targetNoteId
      ? snapshot.notes.find((note) => note.id === targetNoteId)
      : null;
    if (proposal.toolName === 'emotion_map.propose_create_draft') {
      if (!userLocation) {
        onRequireLocation();
        return false;
      }
    } else if (
      proposal.toolName !== 'emotion_map.propose_append_note' &&
      proposal.toolName !== 'emotion_map.propose_schedule_followup'
    ) {
      return false;
    }
    if (targetNoteId && (!targetNote || !proposal.targetNoteFingerprint)) return false;
    if (
      targetNote &&
      await proposalNoteFingerprint(targetNote) !== proposal.targetNoteFingerprint
    ) return false;
    if (
      proposal.status === 'queued' &&
      (cloudRevision === null || proposal.createdAgainstRevision !== cloudRevision)
    ) return false;
    if (proposal.createdAgainstRevision === null) return false;

    const { data: claimData, error: claimError } = await client.rpc(
      'claim_mcp_proposal',
      {
        p_proposal_id: proposal.id,
        p_expected_revision: proposal.createdAgainstRevision,
        p_target_note_fingerprint: proposal.targetNoteFingerprint,
      },
    );
    const claim = Array.isArray(claimData) ? claimData[0] : claimData;
    if (claimError || !claim || claim.status === 'stale') return false;
    if (claim.status === 'already_applied') {
      clearProposalJournal(userId!, proposal.id);
      return true;
    }
    const operationId = text(claim.operation_id, 200);
    if (claim.status !== 'accepting' || !operationId) return false;
    if (appliedThisSession.has(operationId)) return true;

    const fail = async (failureCode: string) => {
      await client.rpc('fail_mcp_proposal', {
        p_proposal_id: proposal.id,
        p_operation_id: operationId,
        p_failure_code: failureCode,
      });
      clearProposalJournal(userId!, proposal.id);
    };

    const recovered = findProposalJournal(userId!, proposal.id);
    if (recovered) {
      if (recovered.operationId !== operationId) {
        await fail('operation_mismatch');
        return false;
      }
      const recovery = classifyProposalJournal(recovered, snapshot);
      if (recovery === 'stale') {
        await fail('local_workspace_changed');
        return false;
      }
      if (recovery === 'apply') {
        try {
          applySnapshot(recovered.after);
          markProposalLocallyApplied(recovered);
        } catch {
          await fail('local_apply_failed');
          return false;
        }
      }
      appliedThisSession.add(operationId);
      return true;
    }

    let nextSnapshot: AppDataSnapshot | null = null;
    let createdMomentId = '';
    if (proposal.toolName === 'emotion_map.propose_create_draft' && userLocation) {
      const localDate = /^\d{4}-\d{2}-\d{2}$/.test(text(payload.localDate, 10))
        ? text(payload.localDate, 10) : undefined;
      const localTime = /^\d{2}:\d{2}$/.test(text(payload.localTime, 5))
        ? text(payload.localTime, 5) : undefined;
      const { moment, note } = createRecord({
        longitude: userLocation.lng,
        latitude: userLocation.lat,
        place: text(payload.place, 160),
        language,
        source: 'current-location',
        date: localDate,
        time: localTime,
        eventTimeSource: 'user',
        locationCapturedAt: new Date(userLocation.timestamp).toISOString(),
        locationTimeRelation: 'confirmation',
      });
      const emotion = EMOTIONS.has(payload.emotion as EmotionKey)
        ? payload.emotion as EmotionKey : null;
      const nextNote = {
        ...note,
        title: text(payload.title, 160) || note.title,
        titleSource: text(payload.title, 160) ? 'user' as const : note.titleSource,
        excerpt: text(payload.text, 2_000),
        emotion,
      };
      nextSnapshot = {
        ...snapshot,
        moments: [...snapshot.moments, { ...moment, emotion }],
        notes: [...snapshot.notes, nextNote],
      };
      createdMomentId = moment.id;
    }
    if (proposal.toolName === 'emotion_map.propose_append_note' && targetNote) {
      const addition = text(payload.text, 2_000);
      if (addition) {
        nextSnapshot = {
          ...snapshot,
          notes: snapshot.notes.map((note) => note.id === targetNote.id
            ? { ...note, excerpt: [note.excerpt.trim(), addition].filter(Boolean).join('\n\n') }
            : note),
        };
      }
    }
    if (proposal.toolName === 'emotion_map.propose_schedule_followup' && targetNote) {
      const interval = payload.intervalDays === 1 || payload.intervalDays === 7
        ? payload.intervalDays
        : 3;
      nextSnapshot = {
        ...snapshot,
        notes: snapshot.notes.map((note) => note.id === targetNote.id
          ? { ...note, followUpEnabled: true }
          : note),
        followUps: snapshot.followUps.some((item) =>
          item.noteId === targetNote.id &&
          (item.status === 'queued' || item.status === 'active'))
          ? snapshot.followUps
          : [...snapshot.followUps, createFollowUpForNote(targetNote, language, interval)],
      };
    }
    if (!nextSnapshot) {
      await fail('invalid_proposal_payload');
      return false;
    }

    const journal = stageProposalApplication({
      userId: userId!,
      proposalId: proposal.id,
      operationId,
      before: snapshot,
      after: nextSnapshot,
    });
    try {
      applySnapshot(nextSnapshot);
      markProposalLocallyApplied(journal);
      appliedThisSession.add(operationId);
      if (createdMomentId) onDraftCreated(createdMomentId);
      return true;
    } catch {
      await fail('local_apply_failed');
      return false;
    }
  };

  return {
    issueMcpToken,
    revokeAllMcpTokens,
    getMcpOutputStatus,
    ...myLifeMemoryConnection,
    ...shortcutAccess,
    listMcpProposals,
    resolveMcpProposal,
  };
};
