import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyAppData } from '../../src/app/appDataRepository';
import { createExternalAccessHandlers } from '../../src/services/externalAccess';
import type { McpProposal } from '../../src/features/settings/settingsTypes';

const proposal: McpProposal = {
  id: 'proposal-a',
  toolName: 'emotion_map.propose_create_draft',
  payload: { title: '待确认草稿', text: '只在本地确认后创建' },
  createdAt: '2026-08-02T00:00:00.000Z',
  status: 'queued',
  createdAgainstRevision: 7,
  targetNoteFingerprint: null,
};

const makeHandlers = ({ rpc, from, applySnapshot = vi.fn() }: {
  rpc: ReturnType<typeof vi.fn>;
  from?: ReturnType<typeof vi.fn>;
  applySnapshot?: ReturnType<typeof vi.fn>;
}) => ({
  handlers: createExternalAccessHandlers({
    client: { rpc, ...(from ? { from } : {}) } as never,
    userId: 'user-a',
    dataMode: 'real',
    userLocation: { lng: 127, lat: 37.558, timestamp: Date.now() },
    language: 'zh',
    snapshot: createEmptyAppData(),
    cloudRevision: 7,
    applySnapshot,
    onDraftCreated: vi.fn(),
    onRequireLocation: vi.fn(),
  }),
  applySnapshot,
});

describe('external proposal application', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('claims then applies a proposal idempotently across repeated clicks', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ status: 'accepting', operation_id: 'operation-a' }],
      error: null,
    });
    const { handlers, applySnapshot } = makeHandlers({ rpc });

    expect(await handlers.resolveMcpProposal(proposal, 'accepted')).toBe(true);
    expect(await handlers.resolveMcpProposal(proposal, 'accepted')).toBe(true);

    expect(applySnapshot).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('claim_mcp_proposal', expect.objectContaining({
      p_proposal_id: 'proposal-a',
      p_expected_revision: 7,
    }));
  });

  it('does not apply a proposal when the server reports a stale target', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ status: 'stale', operation_id: null }],
      error: null,
    });
    const { handlers, applySnapshot } = makeHandlers({ rpc });

    expect(await handlers.resolveMcpProposal(proposal, 'accepted')).toBe(false);
    expect(applySnapshot).not.toHaveBeenCalled();
  });

  it('moves a failed local application to failed instead of accepted', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ status: 'accepting', operation_id: 'operation-a' }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ status: 'failed' }], error: null });
    const applySnapshot = vi.fn(() => {
      throw new Error('local write failed');
    });
    const { handlers } = makeHandlers({ rpc, applySnapshot });

    expect(await handlers.resolveMcpProposal(proposal, 'accepted')).toBe(false);
    expect(rpc).toHaveBeenLastCalledWith('fail_mcp_proposal', {
      p_proposal_id: 'proposal-a',
      p_operation_id: 'operation-a',
      p_failure_code: 'local_apply_failed',
    });
  });

  it('revokes only the read-only output connection', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const { handlers } = makeHandlers({ rpc });

    expect(await handlers.revokeAllMcpTokens()).toBe(true);
    expect(rpc).toHaveBeenCalledWith('revoke_mcp_tokens', {
      p_kind: 'output',
    });
  });

  it('reads output scope, expiry and last-used metadata without the raw token', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{
        kind: 'output', scopes: ['records:read'],
        expires_at: '2026-08-03T00:00:00.000Z',
        last_used_at: '2026-08-02T12:00:00.000Z', revoked_at: null,
      }],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const { handlers } = makeHandlers({ rpc: vi.fn(), from });

    await expect(handlers.getMcpOutputStatus()).resolves.toEqual({
      scope: 'records:read',
      expiresAt: '2026-08-03T00:00:00.000Z',
      lastUsedAt: '2026-08-02T12:00:00.000Z',
    });
    expect(from).toHaveBeenCalledWith('mcp_tokens');
  });
});
