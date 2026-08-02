import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyBroadcast,
  createUploadIntent,
  decideBootstrapSync,
  loadSyncMeta,
  saveSyncMeta,
  type LocalSyncMeta,
} from '../../src/services/cloudSyncModel';

const baseMeta: LocalSyncMeta = {
  baseRevision: 7,
  baseHash: 'base-hash',
  pendingRequestId: null,
  pendingPayloadHash: null,
  dirty: false,
  lastSyncedAt: '2026-08-02T00:00:00.000Z',
};

describe('cloud sync decision model', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses hashes instead of treating the same revision as proof of equality', () => {
    expect(decideBootstrapSync({
      localHash: 'base-hash',
      remoteHash: 'remote-change',
      remoteRevision: 7,
      localHasRecords: true,
      meta: baseMeta,
    })).toBe('use_remote');

    expect(decideBootstrapSync({
      localHash: 'local-change',
      remoteHash: 'base-hash',
      remoteRevision: 7,
      localHasRecords: true,
      meta: baseMeta,
    })).toBe('upload_local');

    expect(decideBootstrapSync({
      localHash: 'local-change',
      remoteHash: 'remote-change',
      remoteRevision: 7,
      localHasRecords: true,
      meta: baseMeta,
    })).toBe('conflict');

    expect(decideBootstrapSync({
      localHash: 'same',
      remoteHash: 'same',
      remoteRevision: 7,
      localHasRecords: true,
      meta: baseMeta,
    })).toBe('synced');
  });

  it('never applies a broadcast over dirty or pending local work', () => {
    expect(classifyBroadcast({
      localHash: 'local-change',
      incomingHash: 'remote-change',
      meta: { ...baseMeta, dirty: true },
    })).toBe('conflict');

    expect(classifyBroadcast({
      localHash: 'base-hash',
      incomingHash: 'remote-change',
      meta: {
        ...baseMeta,
        pendingRequestId: '1f8e2d28-1a1a-4a06-90eb-8fbbd05ecf24',
        pendingPayloadHash: 'base-hash',
      },
    })).toBe('conflict');

    expect(classifyBroadcast({
      localHash: 'base-hash',
      incomingHash: 'remote-change',
      meta: baseMeta,
    })).toBe('fetch_remote');
  });

  it('reuses one persisted requestId for every retry of the same payload', () => {
    const createId = vi
      .fn()
      .mockReturnValueOnce('4f59ebdf-e2ce-4b74-af68-ffb74299537d')
      .mockReturnValueOnce('39583b4d-d74c-41cc-bef8-e19cc8831823');

    const first = createUploadIntent(baseMeta, 'payload-a', createId);
    saveSyncMeta('user-a', first.meta);
    const afterRefresh = loadSyncMeta('user-a');
    const retry = createUploadIntent(afterRefresh, 'payload-a', createId);

    expect(retry.requestId).toBe(first.requestId);
    expect(createId).toHaveBeenCalledTimes(1);

    const changed = createUploadIntent(retry.meta, 'payload-b', createId);
    expect(changed.requestId).not.toBe(first.requestId);
    expect(createId).toHaveBeenCalledTimes(2);
  });
});
