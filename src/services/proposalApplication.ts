import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppDataSnapshot } from '../types';
import {
  canonicalSnapshotDigest,
  migrateAppData,
} from '../app/appDataRepository';

export type ProposalApplicationJournal = {
  userId: string;
  proposalId: string;
  operationId: string;
  beforeHash: string;
  afterHash: string;
  after: AppDataSnapshot;
  localApplied: boolean;
  createdAt: string;
};

const PREFIX = 'my-emotion-map.proposal-application.v1.';
const inFlightCompletions = new Set<string>();

const journalKey = (userId: string, proposalId: string) =>
  `${PREFIX}${encodeURIComponent(userId)}.${encodeURIComponent(proposalId)}`;

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
    const migrated = migrateAppData(value.after);
    if (
      typeof value.userId !== 'string' ||
      typeof value.proposalId !== 'string' ||
      typeof value.operationId !== 'string' ||
      typeof value.beforeHash !== 'string' ||
      typeof value.afterHash !== 'string' ||
      typeof value.createdAt !== 'string' ||
      migrated.status !== 'ok' ||
      canonicalSnapshotDigest(migrated.snapshot) !== value.afterHash
    ) return null;
    return {
      userId: value.userId,
      proposalId: value.proposalId,
      operationId: value.operationId,
      beforeHash: value.beforeHash,
      afterHash: value.afterHash,
      after: migrated.snapshot,
      localApplied: value.localApplied === true,
      createdAt: value.createdAt,
    };
  } catch {
    return null;
  }
};

export const stageProposalApplication = ({
  userId,
  proposalId,
  operationId,
  before,
  after,
}: {
  userId: string;
  proposalId: string;
  operationId: string;
  before: AppDataSnapshot;
  after: AppDataSnapshot;
}) => writeJournal({
  userId,
  proposalId,
  operationId,
  beforeHash: canonicalSnapshotDigest(before),
  afterHash: canonicalSnapshotDigest(after),
  after,
  localApplied: false,
  createdAt: new Date().toISOString(),
});

export const listProposalJournals = (userId: string) => {
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
  const currentHash = canonicalSnapshotDigest(current);
  if (currentHash === journal.afterHash) return 'already_applied';
  if (currentHash === journal.beforeHash) return 'apply';
  return 'stale';
};

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
    if (canonicalSnapshotDigest(snapshot) !== journal.afterHash) continue;
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
