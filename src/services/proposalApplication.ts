import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppDataSnapshot } from '../types';
import { loadLocalSettings } from '../app/profilePreferences';
import { stableSerialize } from '../app/workspace/workspaceStorage';
import {
  assembleNormalizedEmotionSnapshot,
  normalizeEmotionSnapshot,
} from '../domain/storage/normalizedEmotionSnapshot';
import {
  applyEmotionMutationsToSnapshot,
  diffEmotionState,
  emotionMutationKey,
  getEmotionMutationEntityValue,
} from './normalizedSync/emotionMutationModel';
import { validateEmotionMutations } from './normalizedSync/emotionMutationValidation';
import type {
  EmotionMutation,
  NormalizedEmotionSnapshot,
} from './normalizedSync/emotionSyncTypes';

export type ProposalApplicationJournal = {
  userId: string;
  proposalId: string;
  operationId: string;
  targetFingerprints: Record<string, string>;
  mutations: EmotionMutation[];
  beforeEntityHashes: Record<string, string>;
  expectedRevision: number;
  localApplied: boolean;
  createdAt: string;
};

const PREFIX = 'my-emotion-map.proposal-application.v2.';
const LEGACY_PREFIX = 'my-emotion-map.proposal-application.v1.';
const inFlightCompletions = new Set<string>();

const journalKey = (userId: string, proposalId: string) =>
  `${PREFIX}${encodeURIComponent(userId)}.${encodeURIComponent(proposalId)}`;

const entityFingerprint = (
  snapshot: NormalizedEmotionSnapshot,
  mutation: EmotionMutation,
) => stableSerialize(getEmotionMutationEntityValue(snapshot, mutation));

const writeJournal = (journal: ProposalApplicationJournal) => {
  window.localStorage.setItem(
    journalKey(journal.userId, journal.proposalId),
    JSON.stringify(journal),
  );
  return journal;
};

const parseJournal = (raw: string): ProposalApplicationJournal | null => {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof value.userId !== 'string' ||
      typeof value.proposalId !== 'string' ||
      typeof value.operationId !== 'string' ||
      typeof value.createdAt !== 'string' ||
      !Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision) < 0 ||
      !value.targetFingerprints || typeof value.targetFingerprints !== 'object' ||
      !value.beforeEntityHashes || typeof value.beforeEntityHashes !== 'object' ||
      !Array.isArray(value.mutations) || !value.mutations.length
    ) return null;
    const mutations = structuredClone(value.mutations) as EmotionMutation[];
    if (mutations.some((mutation) => mutation.base !== undefined)) return null;
    validateEmotionMutations(mutations);
    const targetFingerprints = structuredClone(value.targetFingerprints) as Record<string, string>;
    const beforeEntityHashes = structuredClone(value.beforeEntityHashes) as Record<string, string>;
    const keys = mutations.map(emotionMutationKey);
    if (keys.some((key) => typeof targetFingerprints[key] !== 'string' ||
      typeof beforeEntityHashes[key] !== 'string')) return null;
    return {
      userId: value.userId,
      proposalId: value.proposalId,
      operationId: value.operationId,
      targetFingerprints,
      mutations,
      beforeEntityHashes,
      expectedRevision: Number(value.expectedRevision),
      localApplied: value.localApplied === true,
      createdAt: value.createdAt,
    };
  } catch {
    return null;
  }
};

const normalizeJournalSnapshot = (userId: string, snapshot: AppDataSnapshot) =>
  normalizeEmotionSnapshot(snapshot, loadLocalSettings(userId)).snapshot;

export const stageProposalApplication = ({
  userId,
  proposalId,
  operationId,
  before,
  after,
  expectedRevision,
}: {
  userId: string;
  proposalId: string;
  operationId: string;
  before: AppDataSnapshot;
  after: AppDataSnapshot;
  expectedRevision: number;
}) => {
  const beforeNormalized = normalizeJournalSnapshot(userId, before);
  const afterNormalized = normalizeJournalSnapshot(userId, after);
  const mutations = diffEmotionState(beforeNormalized, afterNormalized).map(
    ({ base: _base, ...mutation }) => mutation,
  );
  if (!mutations.length) throw new Error('Proposal does not change a normalized entity.');
  return writeJournal({
    userId,
    proposalId,
    operationId,
    targetFingerprints: Object.fromEntries(mutations.map((mutation) => [
      emotionMutationKey(mutation),
      entityFingerprint(afterNormalized, mutation),
    ])),
    mutations,
    beforeEntityHashes: Object.fromEntries(mutations.map((mutation) => [
      emotionMutationKey(mutation),
      entityFingerprint(beforeNormalized, mutation),
    ])),
    expectedRevision,
    localApplied: false,
    createdAt: new Date().toISOString(),
  });
};

const removeLegacyJournals = (userId: string) => {
  try {
    const suffix = `${encodeURIComponent(userId)}.`;
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(`${LEGACY_PREFIX}${suffix}`)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // The server proposal remains recoverable when storage is unavailable.
  }
};

export const listProposalJournals = (userId: string) => {
  removeLegacyJournals(userId);
  const journals: ProposalApplicationJournal[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = window.localStorage.getItem(key);
      const journal = raw ? parseJournal(raw) : null;
      if (journal?.userId === userId) journals.push(journal);
    }
  } catch {
    return [];
  }
  return journals.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
};

export const findProposalJournal = (userId: string, proposalId: string) => {
  removeLegacyJournals(userId);
  try {
    const raw = window.localStorage.getItem(journalKey(userId, proposalId));
    return raw ? parseJournal(raw) : null;
  } catch {
    return null;
  }
};

export const markProposalLocallyApplied = (
  journal: ProposalApplicationJournal,
) => writeJournal({ ...journal, localApplied: true });

export const classifyProposalJournal = (
  journal: ProposalApplicationJournal,
  current: AppDataSnapshot,
): 'apply' | 'already_applied' | 'stale' => {
  const normalized = normalizeJournalSnapshot(journal.userId, current);
  const currentHashes = Object.fromEntries(journal.mutations.map((mutation) => [
    emotionMutationKey(mutation),
    entityFingerprint(normalized, mutation),
  ]));
  const keys = journal.mutations.map(emotionMutationKey);
  if (keys.every((key) => currentHashes[key] === journal.targetFingerprints[key])) {
    return 'already_applied';
  }
  if (keys.every((key) => currentHashes[key] === journal.beforeEntityHashes[key])) {
    return 'apply';
  }
  return 'stale';
};

export const applyProposalJournal = (
  journal: ProposalApplicationJournal,
  current: AppDataSnapshot,
) => assembleNormalizedEmotionSnapshot(
  applyEmotionMutationsToSnapshot(
    normalizeJournalSnapshot(journal.userId, current),
    journal.mutations,
  ),
  {
    lastConversationId: current.lastConversationId,
    lastViewport: current.lastViewport,
  },
);

export const clearProposalJournal = (userId: string, proposalId: string) => {
  try {
    window.localStorage.removeItem(journalKey(userId, proposalId));
  } catch {
    // The server state remains recoverable when local storage is unavailable.
  }
};

export const clearProposalJournals = (userId: string) => {
  listProposalJournals(userId).forEach((journal) =>
    clearProposalJournal(userId, journal.proposalId));
};

export const completePendingProposalApplications = async ({
  client,
  userId,
  snapshot,
  syncedRevision,
}: {
  client: SupabaseClient;
  userId: string;
  snapshot: AppDataSnapshot;
  syncedRevision: number;
}) => {
  for (const journal of listProposalJournals(userId)) {
    if (classifyProposalJournal(journal, snapshot) !== 'already_applied') continue;
    const flightKey = `${userId}:${journal.proposalId}`;
    if (inFlightCompletions.has(flightKey)) continue;
    inFlightCompletions.add(flightKey);
    try {
      const { data, error } = await client.rpc('complete_mcp_proposal', {
        p_proposal_id: journal.proposalId,
        p_operation_id: journal.operationId,
        p_applied_revision: syncedRevision,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (!error && (row?.status === 'applied' || row?.status === 'already_applied')) {
        clearProposalJournal(userId, journal.proposalId);
      }
    } finally {
      inFlightCompletions.delete(flightKey);
    }
  }
};
