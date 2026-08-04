import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  canonicalSnapshotDigest,
  createEmptyAppData,
} from '../../src/app/appDataRepository';
import { createRecord } from '../../src/app/recordFactory';
import { useCloudSync } from '../../src/services/useCloudSync';
import {
  loadSyncMeta,
  saveSyncMeta,
} from '../../src/services/cloudSyncModel';

const session = {
  user: { id: 'cross-device-user' },
} as Session;

const clientWithResponses = (
  responses: Array<{ data: unknown; error: null }>,
) => {
  const maybeSingle = vi.fn();
  responses.forEach((response) => {
    maybeSingle.mockResolvedValueOnce(response);
  });
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
    rpc: vi.fn(),
  } as unknown as SupabaseClient;
  return { client, maybeSingle };
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('BroadcastChannel', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cross-device foreground cloud refresh', () => {
  it('loads a remote star and follow-up chat when the app regains focus', async () => {
    const base = createEmptyAppData();
    const { moment, note } = createRecord({
      longitude: 121.544,
      latitude: 29.8683,
      place: '另一台设备的星星',
      language: 'zh',
      source: 'manual',
    });
    const followUp = {
      id: 'remote-follow-up',
      noteId: note.id,
      intervalDays: 3,
      dueAt: '2026-08-04T00:00:00.000Z',
      status: 'active' as const,
      promptedAt: '2026-08-04T00:00:00.000Z',
      promptVersion: 2,
    };
    const remote = {
      ...base,
      moments: [moment],
      notes: [{ ...note, isDraft: false }],
      followUps: [followUp],
      conversations: [{
        id: 'thread-revisit',
        title: '交流回访',
        preview: '新的回访',
        kind: 'companion' as const,
        unread: true,
        messages: [{
          id: 'remote-follow-up-prompt',
          role: 'assistant' as const,
          body: '',
          kind: 'followup_prompt' as const,
          noteIds: [note.id],
          followUpId: followUp.id,
          createdAt: '2026-08-04T00:00:00.000Z',
        }],
      }],
    };
    saveSyncMeta(session.user.id, {
      baseRevision: 1,
      baseHash: canonicalSnapshotDigest(base),
      pendingRequestId: null,
      pendingPayloadHash: null,
      dirty: false,
      lastSyncedAt: '2026-08-04T00:00:00.000Z',
    });
    const { client, maybeSingle } = clientWithResponses([
      { data: { revision: 1, payload: base }, error: null },
      { data: { revision: 2, payload: remote }, error: null },
    ]);
    const applySnapshot = vi.fn();

    const { result } = renderHook(() =>
      useCloudSync({
        client,
        session,
        snapshot: base,
        applySnapshot,
        pauseUploads: true,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('synced'));
    act(() => window.dispatchEvent(new Event('focus')));

    await waitFor(() => expect(applySnapshot).toHaveBeenCalledWith(remote));
    expect(maybeSingle).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('synced');
  });

  it('keeps both copies and reports a conflict when local work is dirty', async () => {
    const base = createEmptyAppData();
    const local = {
      ...base,
      lastViewport: {
        latitude: 29.8683,
        longitude: 121.544,
        zoom: 14,
      },
    };
    const remote = {
      ...base,
      lastViewport: {
        latitude: 37.558,
        longitude: 127,
        zoom: 16,
      },
    };
    saveSyncMeta(session.user.id, {
      baseRevision: 1,
      baseHash: canonicalSnapshotDigest(base),
      pendingRequestId: null,
      pendingPayloadHash: null,
      dirty: false,
      lastSyncedAt: '2026-08-04T00:00:00.000Z',
    });
    const { client } = clientWithResponses([
      { data: { revision: 1, payload: base }, error: null },
      { data: { revision: 2, payload: remote }, error: null },
    ]);
    const applySnapshot = vi.fn();

    const { result, rerender } = renderHook(
      ({ snapshot }) =>
        useCloudSync({
          client,
          session,
          snapshot,
          applySnapshot,
          pauseUploads: true,
        }),
      { initialProps: { snapshot: base } },
    );
    await waitFor(() => expect(result.current.status).toBe('synced'));

    rerender({ snapshot: local });
    await waitFor(() =>
      expect(loadSyncMeta(session.user.id)?.dirty).toBe(true),
    );
    act(() => window.dispatchEvent(new Event('focus')));

    await waitFor(() => expect(result.current.status).toBe('conflict'));
    expect(applySnapshot).not.toHaveBeenCalled();
  });
});
