import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyAppData } from '../../src/app/appDataRepository';
import {
  classifyProposalJournal,
  completePendingProposalApplications,
  listProposalJournals,
  markProposalLocallyApplied,
  stageProposalApplication,
} from '../../src/services/proposalApplication';

describe('recoverable proposal application', () => {
  beforeEach(() => window.localStorage.clear());

  it('stages the exact next snapshot before local application and recovers after reload', () => {
    const before = createEmptyAppData();
    const after = {
      ...before,
      lastViewport: { latitude: 37.558, longitude: 127, zoom: 15 },
    };
    const journal = stageProposalApplication({
      userId: 'user-a',
      proposalId: 'proposal-a',
      operationId: 'operation-a',
      before,
      after,
    });
    expect(classifyProposalJournal(journal, before)).toBe('apply');
    markProposalLocallyApplied(journal);

    const recovered = listProposalJournals('user-a')[0];
    expect(recovered.localApplied).toBe(true);
    expect(classifyProposalJournal(recovered, after)).toBe('already_applied');
    expect(listProposalJournals('user-b')).toEqual([]);
  });

  it('does not silently reapply when the workspace no longer matches either side', () => {
    const before = createEmptyAppData();
    const after = { ...before, themeTone: 'blue' as const };
    const unrelated = { ...before, themeTone: 'mauve' as const };
    const journal = stageProposalApplication({
      userId: 'user-a',
      proposalId: 'proposal-a',
      operationId: 'operation-a',
      before,
      after,
    });
    expect(classifyProposalJournal(journal, unrelated)).toBe('stale');
  });

  it('marks accepting proposals applied only after the matching snapshot is synced', async () => {
    const before = createEmptyAppData();
    const after = { ...before, themeTone: 'blue' as const };
    stageProposalApplication({
      userId: 'user-a',
      proposalId: 'proposal-a',
      operationId: 'operation-a',
      before,
      after,
    });
    const rpc = vi.fn().mockResolvedValue({
      data: [{ status: 'applied' }],
      error: null,
    });

    await completePendingProposalApplications({
      client: { rpc } as never,
      userId: 'user-a',
      snapshot: after,
      syncedRevision: 9,
    });

    expect(rpc).toHaveBeenCalledWith('complete_mcp_proposal', {
      p_proposal_id: 'proposal-a',
      p_operation_id: 'operation-a',
      p_applied_revision: 9,
    });
    expect(listProposalJournals('user-a')).toEqual([]);
  });
});
