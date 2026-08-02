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

const makeHandlers = ({ rpc, applySnapshot = vi.fn() }: {
  rpc: ReturnType<typeof vi.fn>;
  applySnapshot?: ReturnType<typeof vi.fn>;
}) => ({
  handlers: createExternalAccessHandlers({
    client: { rpc } as never,
    userId: 'user-a',
    dataMode: 'real',
    healthPreferences: {
      restingHeartRateMin: 50,
      restingHeartRateMax: 100,
      rangeConfirmed: true,
      singleSampleEnabled: false,
      workoutPolicy: 'suppress',
      unknownPolicy: 'suppress',
      cooldownMinutes: 30,
    },
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

  it('tests Shortcut pairing through the Edge Function and owner-scoped database readback', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project-ref.supabase.co');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'accepted',
    }), { status: 202, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const limit = vi.fn().mockResolvedValue({
      data: [{ id: 'observation-a', event_id: 'test-event' }], error: null,
    });
    const eq = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const handlers = createExternalAccessHandlers({
      client: { rpc: vi.fn(), from } as never,
      userId: 'user-a',
      dataMode: 'real',
      healthPreferences: {
        restingHeartRateMin: 60,
        restingHeartRateMax: 100,
        rangeConfirmed: true,
        singleSampleEnabled: false,
        workoutPolicy: 'suppress',
        unknownPolicy: 'suppress',
        cooldownMinutes: 30,
      },
      userLocation: null,
      language: 'zh',
      snapshot: createEmptyAppData(),
      cloudRevision: 1,
      applySnapshot: vi.fn(),
      onDraftCreated: vi.fn(),
      onRequireLocation: vi.fn(),
    });

    expect(await handlers.testShortcutPairing(`mes_${'a'.repeat(64)}`)).toBe('verified');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://project-ref.supabase.co/functions/v1/shortcut-ingress',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      version: 3,
      context: 'unknown',
      test: true,
    });
    expect(from).toHaveBeenCalledWith('shortcut_observations');
  });

  it('includes the complete immutable heart-v3 policy when pairing', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        token: `mes_${'b'.repeat(64)}`,
        expires_at: '2026-09-01T00:00:00.000Z',
        shortcut_version: 'shortcut-v3',
        algorithm_version: 'heart-v3',
      }],
      error: null,
    });
    const { handlers } = makeHandlers({ rpc });
    await handlers.issueShortcutPairing();
    expect(rpc).toHaveBeenCalledWith('issue_shortcut_pairing', {
      p_resting_min: 50,
      p_resting_max: 100,
      p_single_sample_enabled: false,
      p_workout_policy: 'suppress',
      p_unknown_policy: 'suppress',
      p_cooldown_minutes: 30,
    });
  });
});
