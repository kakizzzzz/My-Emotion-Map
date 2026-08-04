import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createEmptyAppData } from '../../src/app/appDataRepository';
import { createRecord } from '../../src/app/recordFactory';
import { loadLocalSettings } from '../../src/app/profilePreferences';
import { normalizeEmotionSnapshot } from '../../src/domain/storage/normalizedEmotionSnapshot';
import { diffEmotionState } from '../../src/services/normalizedSync/emotionMutationModel';
import { NormalizedEmotionSyncError } from '../../src/services/normalizedSync/emotionSyncErrors';
import type {
  EmotionMutation,
  NormalizedEmotionSnapshot,
} from '../../src/services/normalizedSync/emotionSyncTypes';
import type { EmotionMutationOutbox } from '../../src/services/normalizedSync/emotionOutbox';
import { useCloudSync } from '../../src/services/useCloudSync';

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  loadChanges: vi.fn(),
  loadFull: vi.fn(),
  applyMutations: vi.fn(),
  applyChanges: vi.fn(),
  enqueue: vi.fn(),
  readOutbox: vi.fn(),
  clear: vi.fn(),
  writeRecovery: vi.fn(),
  discardAfterRecovery: vi.fn(),
  persistBatch: vi.fn(),
  acknowledgeBatch: vi.fn(),
  replaceMutations: vi.fn(),
}));

vi.mock('../../src/services/normalizedSync/emotionSyncBootstrap', () => ({
  bootstrapNormalizedEmotionSync: mocks.bootstrap,
}));

vi.mock('../../src/services/normalizedSync/emotionRepository', () => ({
  loadEmotionChangesSince: mocks.loadChanges,
  loadNormalizedEmotionAccountData: mocks.loadFull,
  applyEmotionMutations: mocks.applyMutations,
  applyEmotionChanges: mocks.applyChanges,
}));

vi.mock('../../src/services/normalizedSync/emotionOutbox', () => ({
  clearEmotionMutationOutbox: mocks.clear,
  enqueueEmotionMutations: mocks.enqueue,
  readEmotionMutationOutbox: mocks.readOutbox,
  newestEmotionOutboxForUser: (
    first: EmotionMutationOutbox | null,
    second: EmotionMutationOutbox | null,
  ) => first ?? second,
  writeEmotionRecoveryBundle: mocks.writeRecovery,
  discardEmotionOutboxAfterRecovery: mocks.discardAfterRecovery,
}));

vi.mock('../../src/services/normalizedSync/emotionOutboxCommit', () => ({
  persistEmotionInFlightBatch: mocks.persistBatch,
  acknowledgeEmotionInFlightBatch: mocks.acknowledgeBatch,
  replaceEmotionOutboxMutations: mocks.replaceMutations,
}));

const session = { user: { id: 'user-a' } } as Session;
const client = { from: vi.fn(), rpc: vi.fn() } as unknown as SupabaseClient;

class BroadcastChannelStub {
  static instances: BroadcastChannelStub[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();

  constructor(public readonly name: string) {
    BroadcastChannelStub.instances.push(this);
  }
}

const normalized = (snapshot = createEmptyAppData()) =>
  normalizeEmotionSnapshot(snapshot, loadLocalSettings(session.user.id)).snapshot;

const outbox = (
  mutations: EmotionMutation[],
  expectedRevision = 0,
): EmotionMutationOutbox => ({
  userId: session.user.id,
  expectedRevision,
  mutations,
  sequence: 1,
  savedAt: 1,
  language: 'zh',
});

const bootstrap = ({
  remote,
  local = remote,
  revision = 0,
  pending = null,
}: {
  remote: NormalizedEmotionSnapshot;
  local?: NormalizedEmotionSnapshot;
  revision?: number;
  pending?: EmotionMutationOutbox | null;
}) => mocks.bootstrap.mockResolvedValue({
  loaded: {
    snapshot: remote,
    revision,
    dataModelVersion: 2,
    migrationVerification: { verified: true },
  },
  local,
  localRecovery: [],
  outbox: pending,
  decision: pending ? 'enqueue_local' : 'already_equal',
});

const emptyChanges = (
  revision: number,
  snapshot: NormalizedEmotionSnapshot,
) => ({
  revision,
  records: [],
  conversations: [],
  messages: [],
  followUps: [],
  revisits: [],
  snapshot,
});

describe('normalized cloud sync', () => {
  beforeEach(() => {
    window.localStorage.clear();
    BroadcastChannelStub.instances = [];
    vi.clearAllMocks();
    mocks.clear.mockResolvedValue(undefined);
    mocks.readOutbox.mockResolvedValue(null);
    mocks.writeRecovery.mockResolvedValue(undefined);
    mocks.discardAfterRecovery.mockResolvedValue(undefined);
    mocks.applyChanges.mockImplementation((_: unknown, changes: { snapshot: unknown }) =>
      changes.snapshot);
    mocks.persistBatch.mockImplementation(async (
      current: EmotionMutationOutbox,
      mutations: EmotionMutation[],
    ) => ({
      ...current,
      inFlightBatch: {
        expectedRevision: current.expectedRevision,
        mutations,
        startedAt: 1,
      },
    }));
    mocks.replaceMutations.mockImplementation(async ({
      outbox: current,
      expectedRevision,
      mutations,
    }: {
      outbox: EmotionMutationOutbox;
      expectedRevision: number;
      mutations: EmotionMutation[];
    }) => ({ ...current, expectedRevision, mutations, inFlightBatch: undefined }));
    mocks.acknowledgeBatch.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('enters upgrade_required without applying or writing future cloud data', async () => {
    mocks.bootstrap.mockRejectedValue(new NormalizedEmotionSyncError({
      kind: 'upgrade_required',
      message: 'Future normalized model.',
    }));
    const applySnapshot = vi.fn();
    const { result } = renderHook(() => useCloudSync({
      client, session, snapshot: createEmptyAppData(), applySnapshot,
    }));

    await waitFor(() => expect(result.current.status).toBe('upgrade_required'));
    expect(applySnapshot).not.toHaveBeenCalled();
    expect(mocks.applyMutations).not.toHaveBeenCalled();
  });

  it('loads a fresh empty normalized workspace without manufacturing a write', async () => {
    bootstrap({ remote: normalized() });
    const { result } = renderHook(() => useCloudSync({
      client, session, snapshot: createEmptyAppData(), applySnapshot: vi.fn(),
    }));

    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(result.current.revision).toBe(0);
    expect(mocks.applyMutations).not.toHaveBeenCalled();
  });

  it('uploads existing local records to an empty normalized account', async () => {
    const empty = normalized();
    const { moment, note } = createRecord({
      longitude: 127,
      latitude: 37.558,
      place: '本地星星',
      language: 'zh',
      source: 'manual',
    });
    const localApp = {
      ...createEmptyAppData(),
      moments: [moment],
      notes: [{ ...note, isDraft: false }],
    };
    const local = normalized(localApp);
    const mutations = diffEmotionState(empty, local);
    bootstrap({ remote: empty, local, pending: outbox(mutations) });
    mocks.applyMutations.mockResolvedValue({ saved: true, revision: 1, conflict: null });
    mocks.loadChanges.mockResolvedValue(emptyChanges(1, local));

    const { result } = renderHook(() => useCloudSync({
      client, session, snapshot: localApp, applySnapshot: vi.fn(),
    }));

    await waitFor(() => expect(result.current.revision).toBe(1), { timeout: 2_000 });
    expect(result.current.status).toBe('synced');
    expect(result.current.isUserOperationSync).toBe(false);
    expect(mocks.applyMutations).toHaveBeenCalledWith(client, 0, mutations);
  });

  it('fast-forwards to remote normalized entities when no local mutations exist', async () => {
    const localApp = createEmptyAppData();
    const { moment, note } = createRecord({
      longitude: 127,
      latitude: 37.558,
      place: '云端星星',
      language: 'zh',
      source: 'manual',
    });
    const remote = normalized({
      ...localApp,
      moments: [moment],
      notes: [{ ...note, isDraft: false }],
    });
    bootstrap({ remote, local: normalized(localApp), revision: 7 });
    const applySnapshot = vi.fn();

    const { result } = renderHook(() => useCloudSync({
      client, session, snapshot: localApp, applySnapshot,
    }));

    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      moments: [expect.objectContaining({ place: '云端星星' })],
    }));
  });

  it('pauses when local and remote changed the same record', async () => {
    const { moment, note } = createRecord({
      longitude: 127,
      latitude: 37.558,
      place: '原地点',
      language: 'zh',
      source: 'manual',
    });
    const baseApp = {
      ...createEmptyAppData(), moments: [moment], notes: [{ ...note, isDraft: false }],
    };
    const base = normalized(baseApp);
    const localApp = structuredClone(baseApp);
    localApp.moments[0].place = '本机地点';
    localApp.notes[0].place = '本机地点';
    const local = normalized(localApp);
    const remote = structuredClone(base);
    remote.records[0].place = '云端地点';
    const pending = outbox(diffEmotionState(base, local), 7);
    bootstrap({ remote, local, revision: 8, pending });
    const applySnapshot = vi.fn();

    const { result } = renderHook(() => useCloudSync({
      client, session, snapshot: localApp, applySnapshot,
    }));

    await waitFor(() => expect(result.current.status).toBe('conflict'));
    expect(applySnapshot).not.toHaveBeenCalled();
    expect(mocks.writeRecovery).toHaveBeenCalledTimes(1);
  });

  it('does not let a revision broadcast overwrite dirty local work', async () => {
    vi.stubGlobal('BroadcastChannel', BroadcastChannelStub);
    const { moment, note } = createRecord({
      longitude: 127,
      latitude: 37.558,
      place: '原地点',
      language: 'zh',
      source: 'manual',
    });
    const baseApp = {
      ...createEmptyAppData(), moments: [moment], notes: [{ ...note, isDraft: false }],
    };
    const base = normalized(baseApp);
    const localApp = structuredClone(baseApp);
    localApp.moments[0].place = '本机地点';
    localApp.notes[0].place = '本机地点';
    const local = normalized(localApp);
    const remote = structuredClone(base);
    remote.records[0].place = '云端地点';
    bootstrap({ remote: base, local: base, revision: 7 });
    mocks.enqueue.mockResolvedValue(outbox(diffEmotionState(base, local), 7));
    mocks.loadChanges.mockResolvedValue(emptyChanges(8, remote));
    mocks.applyMutations.mockImplementation(() => new Promise(() => undefined));
    const applySnapshot = vi.fn();

    const { result, rerender } = renderHook(
      ({ snapshot }) => useCloudSync({ client, session, snapshot, applySnapshot }),
      { initialProps: { snapshot: baseApp } },
    );
    await waitFor(() => expect(result.current.status).toBe('synced'));
    rerender({ snapshot: localApp });
    await waitFor(() => expect(result.current.status).toBe('local'));
    const channel = BroadcastChannelStub.instances.at(-1);
    expect(channel?.name).toBe('my-emotion-map-sync:user-a');

    act(() => channel?.onmessage?.({
      data: { type: 'normalized_revision', userId: 'user-a', revision: 8 },
    } as MessageEvent<unknown>));

    await waitFor(() => expect(result.current.status).toBe('conflict'));
    expect(applySnapshot).toHaveBeenCalledTimes(1);
  });

  it('retries the exact persisted mutation batch after reload', async () => {
    const empty = normalized();
    const { moment, note } = createRecord({
      longitude: 127,
      latitude: 37.558,
      place: '待重试星星',
      language: 'zh',
      source: 'manual',
    });
    const localApp = {
      ...createEmptyAppData(), moments: [moment], notes: [{ ...note, isDraft: false }],
    };
    const local = normalized(localApp);
    const mutations = diffEmotionState(empty, local);
    const pending = {
      ...outbox(mutations, 7),
      inFlightBatch: { expectedRevision: 7, mutations, startedAt: 10 },
    };
    bootstrap({ remote: empty, local, revision: 7, pending });
    mocks.applyMutations.mockResolvedValue({ saved: true, revision: 8, conflict: null });
    mocks.loadChanges.mockResolvedValue(emptyChanges(8, local));

    renderHook(() => useCloudSync({
      client, session, snapshot: localApp, applySnapshot: vi.fn(),
    }));

    await waitFor(() => expect(mocks.applyMutations).toHaveBeenCalledTimes(1), {
      timeout: 2_000,
    });
    expect(mocks.applyMutations).toHaveBeenCalledWith(client, 7, mutations);
    expect(mocks.persistBatch).toHaveBeenCalledWith(
      expect.any(Object),
      mutations,
    );
  });
});
