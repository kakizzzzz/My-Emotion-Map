import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createEmptyAppData } from '../../src/app/appDataRepository';
import { createRecord } from '../../src/app/recordFactory';
import { loadLocalSettings } from '../../src/app/profilePreferences';
import { normalizeEmotionSnapshot } from '../../src/domain/storage/normalizedEmotionSnapshot';
import { diffEmotionState } from '../../src/services/normalizedSync/emotionMutationModel';
import type {
  EmotionMutation,
  NormalizedEmotionSnapshot,
} from '../../src/services/normalizedSync/emotionSyncTypes';
import type { EmotionMutationOutbox } from '../../src/services/normalizedSync/emotionOutbox';
import { useCloudSync } from '../../src/services/useCloudSync';

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  loadChanges: vi.fn(),
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
  loadNormalizedEmotionAccountData: vi.fn(),
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

const session = { user: { id: 'cross-device-user' } } as Session;
const client = { from: vi.fn(), rpc: vi.fn() } as unknown as SupabaseClient;
const normalized = (snapshot = createEmptyAppData()) =>
  normalizeEmotionSnapshot(snapshot, loadLocalSettings(session.user.id)).snapshot;
const outbox = (
  mutations: EmotionMutation[],
  expectedRevision: number,
): EmotionMutationOutbox => ({
  userId: session.user.id,
  expectedRevision,
  mutations,
  sequence: 1,
  savedAt: 1,
  language: 'zh',
});
const loaded = (
  snapshot: NormalizedEmotionSnapshot,
  revision: number,
) => ({
  loaded: {
    snapshot,
    revision,
    dataModelVersion: 2,
    migrationVerification: { verified: true },
  },
  local: snapshot,
  localRecovery: [],
  outbox: null,
  decision: 'already_equal',
});
const changes = (
  snapshot: NormalizedEmotionSnapshot,
  revision: number,
) => ({
  revision,
  records: [], conversations: [], messages: [], followUps: [], revisits: [],
  snapshot,
});

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal('BroadcastChannel', undefined);
  mocks.clear.mockResolvedValue(undefined);
  mocks.readOutbox.mockResolvedValue(null);
  mocks.writeRecovery.mockResolvedValue(undefined);
  mocks.applyChanges.mockImplementation((_: unknown, value: { snapshot: unknown }) =>
    value.snapshot);
  mocks.enqueue.mockImplementation(async ({
    expectedRevision,
    mutations,
  }: {
    expectedRevision: number;
    mutations: EmotionMutation[];
  }) => outbox(mutations, expectedRevision));
  mocks.replaceMutations.mockImplementation(async ({
    outbox: current,
    expectedRevision,
    mutations,
  }: {
    outbox: EmotionMutationOutbox;
    expectedRevision: number;
    mutations: EmotionMutation[];
  }) => ({ ...current, expectedRevision, mutations }));
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
  mocks.acknowledgeBatch.mockResolvedValue(null);
  mocks.applyMutations.mockImplementation(() => new Promise(() => undefined));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('cross-device foreground normalized refresh', () => {
  it('queues edits made while the initial cloud bootstrap is still loading', async () => {
    const baseApp = createEmptyAppData();
    const base = normalized(baseApp);
    const { moment, note } = createRecord({
      longitude: 121.544,
      latitude: 29.8683,
      place: '启动时放下的星星',
      language: 'zh',
      source: 'manual',
    });
    const localApp = {
      ...baseApp,
      moments: [moment],
      notes: [{ ...note, isDraft: false }],
    };
    let finishBootstrap!: (value: ReturnType<typeof loaded>) => void;
    mocks.bootstrap.mockImplementationOnce(() => new Promise((resolve) => {
      finishBootstrap = resolve;
    }));
    const applySnapshot = vi.fn();
    const { rerender } = renderHook(
      ({ snapshot }) => useCloudSync({ client, session, snapshot, applySnapshot }),
      { initialProps: { snapshot: baseApp } },
    );

    rerender({ snapshot: localApp });
    await act(async () => { finishBootstrap(loaded(base, 0)); });

    await waitFor(() => expect(mocks.enqueue).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(applySnapshot).toHaveBeenCalled());
    expect(applySnapshot.mock.calls.at(-1)?.[0].moments).toHaveLength(1);
  });

  it('does not let an old remote snapshot overwrite a local edit awaiting enqueue', async () => {
    const baseApp = createEmptyAppData();
    const base = normalized(baseApp);
    const { moment, note } = createRecord({
      longitude: 121.544,
      latitude: 29.8683,
      place: '刚放下的星星',
      language: 'zh',
      source: 'manual',
    });
    const localApp = {
      ...baseApp,
      moments: [moment],
      notes: [{ ...note, isDraft: false }],
    };
    mocks.bootstrap.mockResolvedValue(loaded(base, 0));
    mocks.loadChanges.mockResolvedValue(changes(base, 0));
    mocks.enqueue.mockImplementationOnce(() => new Promise(() => undefined));
    const applySnapshot = vi.fn();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useCloudSync({ client, session, snapshot, applySnapshot }),
      { initialProps: { snapshot: baseApp } },
    );
    await waitFor(() => expect(result.current.status).toBe('synced'));
    applySnapshot.mockClear();

    rerender({ snapshot: localApp });
    await waitFor(() => expect(mocks.enqueue).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event('focus')));
    await act(async () => { await Promise.resolve(); });

    expect(applySnapshot).not.toHaveBeenCalled();
  });

  it('does not apply a draft upload receipt over a final save awaiting enqueue', async () => {
    const baseApp = createEmptyAppData();
    const base = normalized(baseApp);
    const { moment, note } = createRecord({
      longitude: 121.544,
      latitude: 29.8683,
      place: '先上传草稿的星星',
      language: 'zh',
      source: 'manual',
    });
    const draftApp = {
      ...baseApp,
      moments: [moment],
      notes: [note],
    };
    const finalApp = {
      ...draftApp,
      moments: [{ ...moment, isNew: false, emotion: 'calm' as const }],
      notes: [{
        ...note,
        title: '已经正式保存',
        titleSource: 'user' as const,
        isDraft: false,
        emotion: 'calm' as const,
      }],
    };
    const remoteDraft = normalized(draftApp);
    mocks.bootstrap.mockResolvedValue(loaded(base, 0));
    mocks.loadChanges.mockResolvedValue(changes(remoteDraft, 1));
    let finishFirstUpload!: (value: { saved: true; revision: number }) => void;
    mocks.applyMutations.mockImplementationOnce(() => new Promise((resolve) => {
      finishFirstUpload = resolve;
    }));
    const applySnapshot = vi.fn();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useCloudSync({ client, session, snapshot, applySnapshot }),
      { initialProps: { snapshot: baseApp } },
    );
    await waitFor(() => expect(result.current.status).toBe('synced'));
    applySnapshot.mockClear();

    rerender({ snapshot: draftApp });
    await waitFor(() => expect(mocks.applyMutations).toHaveBeenCalledTimes(1));
    let finishFinalEnqueue!: () => void;
    mocks.enqueue.mockImplementationOnce(({
      expectedRevision,
      mutations,
    }: {
      expectedRevision: number;
      mutations: EmotionMutation[];
    }) => new Promise((resolve) => {
      finishFinalEnqueue = () => resolve(outbox(mutations, expectedRevision));
    }));
    rerender({ snapshot: finalApp });
    await waitFor(() => expect(mocks.enqueue).toHaveBeenCalledTimes(2));
    await act(async () => { finishFirstUpload({ saved: true, revision: 1 }); });
    await waitFor(() => expect(mocks.loadChanges).toHaveBeenCalledTimes(1));

    expect(applySnapshot).not.toHaveBeenCalled();
    await act(async () => { finishFinalEnqueue(); });
    await waitFor(() => expect(mocks.applyMutations).toHaveBeenCalledTimes(2));
  });

  it('loads a remote star and follow-up chat when the app regains focus', async () => {
    const baseApp = createEmptyAppData();
    const base = normalized(baseApp);
    const { moment, note } = createRecord({
      longitude: 121.544,
      latitude: 29.8683,
      place: '另一台设备的星星',
      language: 'zh',
      source: 'manual',
    });
    const remoteApp = {
      ...baseApp,
      moments: [moment],
      notes: [{ ...note, isDraft: false }],
      followUps: [{
        id: 'remote-follow-up',
        noteId: note.id,
        intervalDays: 3,
        dueAt: '2026-08-04T00:00:00.000Z',
        status: 'active' as const,
        promptedAt: '2026-08-04T00:00:00.000Z',
        promptVersion: 2,
      }],
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
          followUpId: 'remote-follow-up',
          createdAt: '2026-08-04T00:00:00.000Z',
        }],
      }],
    };
    const remote = normalized(remoteApp);
    mocks.bootstrap.mockResolvedValue(loaded(base, 1));
    mocks.loadChanges.mockResolvedValue(changes(remote, 2));
    const applySnapshot = vi.fn();
    const { result } = renderHook(() => useCloudSync({
      client, session, snapshot: baseApp, applySnapshot,
    }));
    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(result.current.isUserOperationSync).toBe(false);
    applySnapshot.mockClear();

    act(() => window.dispatchEvent(new Event('focus')));

    await waitFor(() => expect(applySnapshot).toHaveBeenCalledTimes(1));
    const applied = applySnapshot.mock.calls[0][0];
    expect(applied.moments[0]).toMatchObject({
      place: '另一台设备的星星', noteId: note.id,
    });
    expect(applied.followUps[0]).toMatchObject({
      id: 'remote-follow-up', status: 'active',
    });
    expect(applied.conversations[0].messages[0]).toMatchObject({
      followUpId: 'remote-follow-up', kind: 'followup_prompt',
    });
    expect(result.current.revision).toBe(2);
    expect(result.current.isUserOperationSync).toBe(false);
  });

  it('keeps the local copy and reports a same-record foreground conflict', async () => {
    const { moment, note } = createRecord({
      longitude: 121.544,
      latitude: 29.8683,
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
    remote.records[0].place = '另一台设备地点';
    mocks.bootstrap.mockResolvedValue(loaded(base, 1));
    mocks.loadChanges.mockResolvedValue(changes(remote, 2));
    const applySnapshot = vi.fn();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useCloudSync({ client, session, snapshot, applySnapshot }),
      { initialProps: { snapshot: baseApp } },
    );
    await waitFor(() => expect(result.current.status).toBe('synced'));
    rerender({ snapshot: localApp });
    await waitFor(() => expect(mocks.enqueue).toHaveBeenCalled());
    expect(result.current.isUserOperationSync).toBe(true);
    expect(diffEmotionState(base, local)).toHaveLength(1);

    act(() => window.dispatchEvent(new Event('focus')));

    await waitFor(() => expect(result.current.status).toBe('conflict'));
    expect(mocks.writeRecovery).toHaveBeenCalledTimes(1);
    expect(applySnapshot).toHaveBeenCalledTimes(1);
  });
});
