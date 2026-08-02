import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppLanguage } from '../i18n';
import { createRecord } from '../app/recordFactory';
import { createFollowUpForNote } from '../domain/followUps';
import type {
  DataMode,
  EmotionKey,
  EmotionMoment,
  EmotionNote,
  FollowUpRecord,
  HealthPreferences,
} from '../types';
import type { UserLocation } from '../useLocationController';
import type { McpProposal } from '../features/settings/settingsTypes';

const EMOTIONS = new Set<EmotionKey>([
  'calm', 'joy', 'tender', 'curious', 'energized', 'connected',
  'heavy', 'restless', 'focused', 'overwhelmed', 'numb', 'mixed',
]);
const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export const createExternalAccessHandlers = ({
  client,
  userId,
  dataMode,
  healthPreferences,
  userLocation,
  language,
  setMoments,
  setNotes,
  notes,
  setFollowUps,
  onDraftCreated,
  onRequireLocation,
}: {
  client: SupabaseClient | null;
  userId: string | null;
  dataMode: DataMode;
  healthPreferences: HealthPreferences;
  userLocation: UserLocation | null;
  language: AppLanguage;
  setMoments: Dispatch<SetStateAction<EmotionMoment[]>>;
  setNotes: Dispatch<SetStateAction<EmotionNote[]>>;
  notes: EmotionNote[];
  setFollowUps: Dispatch<SetStateAction<FollowUpRecord[]>>;
  onDraftCreated: (momentId: string) => void;
  onRequireLocation: () => void;
}) => {
  const available = Boolean(client && userId && dataMode === 'real');
  const issueMcpToken = async (kind: 'input' | 'output') => {
    if (!client || !available) return null;
    const { data, error } = await client.rpc('issue_mcp_token', {
      p_kind: kind,
      p_ttl_hours: 24,
    });
    const row = Array.isArray(data) ? data[0] : data;
    return !error && row && typeof row.token === 'string' &&
      typeof row.expires_at === 'string'
      ? { token: row.token, expiresAt: row.expires_at }
      : null;
  };

  const revokeAllTokens = async () => {
    if (!client || !userId) return false;
    const [mcp, shortcut] = await Promise.all([
      client.rpc('revoke_all_mcp_tokens'),
      client.rpc('revoke_all_shortcut_tokens'),
    ]);
    return !mcp.error && !shortcut.error;
  };

  const issueShortcutPairing = async () => {
    if (!client || !available || !healthPreferences.rangeConfirmed) return null;
    const { data, error } = await client.rpc('issue_shortcut_pairing', {
      p_resting_min: healthPreferences.restingHeartRateMin,
      p_resting_max: healthPreferences.restingHeartRateMax,
    });
    const row = Array.isArray(data) ? data[0] : data;
    return !error && row && typeof row.token === 'string' &&
      typeof row.expires_at === 'string'
      ? { token: row.token, expiresAt: row.expires_at }
      : null;
  };

  const listMcpProposals = async (): Promise<McpProposal[]> => {
    if (!client || !available) return [];
    const { data, error } = await client
      .from('mcp_proposals')
      .select('id,tool_name,payload,created_at')
      .eq('status', 'queued')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data)) return [];
    return data.flatMap((row): McpProposal[] =>
      typeof row.id === 'string' && typeof row.tool_name === 'string' &&
      row.payload && typeof row.payload === 'object' &&
      typeof row.created_at === 'string'
        ? [{ id: row.id, toolName: row.tool_name, payload: row.payload as Record<string, unknown>, createdAt: row.created_at }]
        : [],
    );
  };

  const resolveMcpProposal = async (
    proposal: McpProposal,
    decision: 'accepted' | 'rejected',
  ) => {
    if (!client || !available) return false;
    if (decision === 'accepted') {
      if (proposal.toolName === 'emotion_map.propose_create_draft' && !userLocation) {
        onRequireLocation();
        return false;
      }
      if (proposal.toolName === 'emotion_map.propose_append_note') {
        const noteId = text(proposal.payload.noteId, 200);
        if (!notes.some((note) => note.id === noteId) ||
          !text(proposal.payload.text, 2_000)) return false;
      } else if (proposal.toolName === 'emotion_map.propose_schedule_followup') {
        if (!notes.some((note) => note.id === text(proposal.payload.noteId, 200))) {
          return false;
        }
      } else if (proposal.toolName !== 'emotion_map.propose_create_draft') {
        return false;
      }
    }
    const { data, error } = await client
      .from('mcp_proposals')
      .update({ status: decision })
      .eq('id', proposal.id)
      .eq('status', 'queued')
      .select('id');
    if (error || !Array.isArray(data) || data.length !== 1) return false;
    if (decision === 'rejected') return true;

    const payload = proposal.payload;
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
      setMoments((current) => [...current, { ...moment, emotion }]);
      setNotes((current) => [...current, nextNote]);
      onDraftCreated(moment.id);
      return true;
    }
    if (proposal.toolName === 'emotion_map.propose_append_note') {
      const noteId = text(payload.noteId, 200);
      const addition = text(payload.text, 2_000);
      if (!noteId || !addition) return false;
      setNotes((current) => current.map((note) => note.id === noteId
        ? { ...note, excerpt: [note.excerpt.trim(), addition].filter(Boolean).join('\n\n') }
        : note));
      return true;
    }
    if (proposal.toolName === 'emotion_map.propose_schedule_followup') {
      const noteId = text(payload.noteId, 200);
      const interval = payload.intervalDays === 1 || payload.intervalDays === 7 ? payload.intervalDays : 3;
      const selected = notes.find((note) => note.id === noteId);
      if (!selected) return false;
      setNotes((current) => current.map((note) => note.id === noteId
        ? { ...note, followUpEnabled: true }
        : note));
      setFollowUps((current) => current.some((item) =>
        item.noteId === noteId && (item.status === 'queued' || item.status === 'active'))
        ? current
        : [...current, createFollowUpForNote(selected, language, interval)]);
      return true;
    }
    return false;
  };

  return {
    issueMcpToken,
    revokeAllTokens,
    issueShortcutPairing,
    listMcpProposals,
    resolveMcpProposal,
  };
};
