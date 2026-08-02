import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  CURRENT_SCHEMA_VERSION,
  canonicalSnapshotDigest,
  createEmptyAppData,
} from '../../src/app/appDataRepository';
import { useCloudSync } from '../../src/services/useCloudSync';
import { loadSyncMeta, saveSyncMeta } from '../../src/services/cloudSyncModel';

const session = {
  user: { id: 'user-a' },
} as Session;

class BroadcastChannelStub {
  static instances: BroadcastChannelStub[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(public readonly name: string) {
    BroadcastChannelStub.instances.push(this);
  }

  postMessage = vi.fn();
  close = vi.fn();
}

describe('cloud sync', () => {
  beforeEach(() => {
    window.localStorage.clear();
    BroadcastChannelStub.instances = [];
  });

  afterEach(() => vi.unstubAllGlobals());

  it('enters upgrade_required without applying or rewriting a future remote schema', async () => {
    const remotePayload = {
      ...createEmptyAppData(),
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      futureOnlyField: { mustSurvive: true },
    };
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { revision: 7, payload: remotePayload },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const rpc = vi.fn();
    const client = {
      from: vi.fn(() => ({ select })),
      rpc,
    } as unknown as SupabaseClient;
    const applySnapshot = vi.fn();

    const { result } = renderHook(() =>
      useCloudSync({
        client,
        session,
        snapshot: createEmptyAppData(),
        applySnapshot,
      }),
    );

    await waitFor(() =>
      expect(result.current.status as string).toBe('upgrade_required'),
    );
    expect(applySnapshot).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('creates revision 1 for a fresh authenticated empty workspace', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const rpc = vi.fn().mockResolvedValue({
      data: { revision: 1, updated_at: '2026-08-02T00:00:00.000Z' },
      error: null,
    });
    const client = {
      from: vi.fn(() => ({ select })),
      rpc,
    } as unknown as SupabaseClient;

    const { result } = renderHook(() =>
      useCloudSync({
        client,
        session,
        snapshot: createEmptyAppData(),
        applySnapshot: vi.fn(),
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('synced'));
    await waitFor(() => expect(result.current.revision).toBe(1));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'save_app_state',
      expect.objectContaining({
        p_expected_revision: 0,
        p_schema_version: CURRENT_SCHEMA_VERSION,
        p_payload: createEmptyAppData(),
      }),
    );
  });

  it('fast-forwards from remote when local still matches the stored base hash', async () => {
    const base = createEmptyAppData();
    const remote = {
      ...base,
      lastViewport: { latitude: 37.558, longitude: 127, zoom: 15 },
    };
    saveSyncMeta('user-a', {
      baseRevision: 7,
      baseHash: canonicalSnapshotDigest(base),
      pendingRequestId: null,
      pendingPayloadHash: null,
      dirty: false,
      lastSyncedAt: '2026-08-02T00:00:00.000Z',
    });
    window.localStorage.setItem('my-emotion-map.cloud-revision.user-a', '7');
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { revision: 7, payload: remote },
      error: null,
    });
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
      rpc: vi.fn(),
    } as unknown as SupabaseClient;
    const applySnapshot = vi.fn();

    const { result } = renderHook(() =>
      useCloudSync({
        client,
        session,
        snapshot: base,
        applySnapshot,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(applySnapshot).toHaveBeenCalledWith(remote);
  });

  it('pauses when both local and remote changed from the stored base', async () => {
    const base = createEmptyAppData();
    const local = {
      ...base,
      lastViewport: { latitude: 37.557, longitude: 126.999, zoom: 14 },
    };
    const remote = {
      ...base,
      lastViewport: { latitude: 37.559, longitude: 127.001, zoom: 16 },
    };
    saveSyncMeta('user-a', {
      baseRevision: 7,
      baseHash: canonicalSnapshotDigest(base),
      pendingRequestId: null,
      pendingPayloadHash: null,
      dirty: false,
      lastSyncedAt: '2026-08-02T00:00:00.000Z',
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { revision: 8, payload: remote },
      error: null,
    });
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
      rpc: vi.fn(),
    } as unknown as SupabaseClient;
    const applySnapshot = vi.fn();

    const { result } = renderHook(() =>
      useCloudSync({ client, session, snapshot: local, applySnapshot }),
    );

    await waitFor(() => expect(result.current.status).toBe('conflict'));
    expect(applySnapshot).not.toHaveBeenCalled();
  });

  it('does not let a broadcast overwrite dirty local work', async () => {
    vi.stubGlobal('BroadcastChannel', BroadcastChannelStub);
    const base = createEmptyAppData();
    const local = {
      ...base,
      lastViewport: { latitude: 37.557, longitude: 126.999, zoom: 14 },
    };
    const remote = {
      ...base,
      lastViewport: { latitude: 37.559, longitude: 127.001, zoom: 16 },
    };
    const baseHash = canonicalSnapshotDigest(base);
    saveSyncMeta('user-a', {
      baseRevision: 7,
      baseHash,
      pendingRequestId: null,
      pendingPayloadHash: null,
      dirty: false,
      lastSyncedAt: '2026-08-02T00:00:00.000Z',
    });
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { revision: 7, payload: base }, error: null })
      .mockResolvedValueOnce({ data: { revision: 8, payload: remote }, error: null });
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
      rpc: vi.fn(),
    } as unknown as SupabaseClient;
    const applySnapshot = vi.fn();

    const { result, rerender } = renderHook(
      ({ current }) => useCloudSync({ client, session, snapshot: current, applySnapshot }),
      { initialProps: { current: base } },
    );
    await waitFor(() => expect(result.current.status).toBe('synced'));

    rerender({ current: local });
    await waitFor(() => expect(loadSyncMeta('user-a')?.dirty).toBe(true));
    const channel = BroadcastChannelStub.instances.at(-1);
    expect(channel).toBeDefined();
    channel?.onmessage?.({
      data: {
        type: 'synced_snapshot',
        userId: 'user-a',
        revision: 8,
        hash: canonicalSnapshotDigest(remote),
        generation: 'another-tab',
      },
    } as MessageEvent<unknown>);

    await waitFor(() => expect(result.current.status).toBe('conflict'));
    expect(applySnapshot).not.toHaveBeenCalled();
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('reuses the persisted request id after reload when retrying the same payload', async () => {
    const base = createEmptyAppData();
    const local = {
      ...base,
      lastViewport: { latitude: 37.557, longitude: 126.999, zoom: 14 },
    };
    const localHash = canonicalSnapshotDigest(local);
    saveSyncMeta('user-a', {
      baseRevision: 7,
      baseHash: canonicalSnapshotDigest(base),
      pendingRequestId: '1f8e2d28-1a1a-4a06-90eb-8fbbd05ecf24',
      pendingPayloadHash: localHash,
      dirty: true,
      lastSyncedAt: '2026-08-02T00:00:00.000Z',
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { revision: 7, payload: base },
      error: null,
    });
    const rpc = vi.fn().mockResolvedValue({
      data: { revision: 8, updated_at: '2026-08-02T00:00:00.000Z' },
      error: null,
    });
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
      rpc,
    } as unknown as SupabaseClient;

    renderHook(() =>
      useCloudSync({ client, session, snapshot: local, applySnapshot: vi.fn() }),
    );

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    expect(rpc).toHaveBeenCalledWith(
      'save_app_state',
      expect.objectContaining({
        p_expected_revision: 7,
        p_request_id: '1f8e2d28-1a1a-4a06-90eb-8fbbd05ecf24',
        p_payload: local,
      }),
    );
  });
});
