import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyAppData } from '../../src/app/appDataRepository';
import { createDefaultLocalSettings } from '../../src/app/profilePreferences';
import { createRecord } from '../../src/app/recordFactory';
import { normalizeEmotionSnapshot } from '../../src/domain/storage/normalizedEmotionSnapshot';
import {
  keepLocalEmotionConflicts,
  preserveEmotionMutationConflicts,
  reconcileEmotionMutationsAfterRemoteAdvance,
} from '../../src/services/normalizedSync/emotionConflicts';
import {
  EMOTION_OUTBOX_STORE_NAME,
  EMOTION_SYNC_DB_NAME,
  decideLegacySyncConversion,
  emotionOutboxForUser,
  mergeEmotionOutbox,
  newestEmotionOutboxForUser,
  withEmotionInFlightBatch,
  writeEmotionMutationOutbox,
  type EmotionMutationOutbox,
} from '../../src/services/normalizedSync/emotionOutbox';
import {
  applyEmotionMutationsToSnapshot,
  compactEmotionMutations,
  diffEmotionState,
} from '../../src/services/normalizedSync/emotionMutationModel';
import type {
  EmotionMutation,
  NormalizedEmotionSnapshot,
} from '../../src/services/normalizedSync/emotionSyncTypes';
import { localEmotionDriftBeyondOutbox } from '../../src/services/normalizedSync/emotionSyncBootstrap';
import type { AppDataSnapshot, FollowUpRecord } from '../../src/types';

const normalized = (snapshot: AppDataSnapshot) =>
  normalizeEmotionSnapshot(snapshot, createDefaultLocalSettings()).snapshot;

const recordSnapshot = (count = 1) => {
  const snapshot = createEmptyAppData();
  for (let index = 0; index < count; index += 1) {
    const { moment, note } = createRecord({
      longitude: 121.544 + index / 1_000,
      latitude: 29.8683 + index / 1_000,
      place: `Place ${index}`,
      language: 'zh',
      source: 'manual',
    });
    snapshot.moments.push(moment);
    snapshot.notes.push(note);
  }
  return snapshot;
};

const outbox = (
  userId: string,
  mutations: EmotionMutation[] = [],
): EmotionMutationOutbox => ({
  userId,
  expectedRevision: 4,
  mutations,
  sequence: 1,
  savedAt: 10,
  language: 'zh',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('durable emotion mutation outbox', () => {
  it('folds a local delete that happened after a pending create before reload', () => {
    const remote = normalized(createEmptyAppData());
    const created = normalized(recordSnapshot());
    const pending = outbox('user-a', diffEmotionState(remote, created));

    const localDrift = localEmotionDriftBeyondOutbox({
      remote,
      local: remote,
      outbox: pending,
    });
    expect(localDrift.map((mutation) => mutation.type)).toContain('record_soft_delete');
    expect(mergeEmotionOutbox({
      existing: pending,
      userId: 'user-a',
      expectedRevision: 4,
      mutations: localDrift,
      language: 'zh',
    }).mutations).toEqual([]);
  });

  it('keeps a delete behind an uncertain in-flight create until acknowledgement', () => {
    const remote = normalized(createEmptyAppData());
    const created = normalized(recordSnapshot());
    const pendingCreate = diffEmotionState(remote, created);
    const pending = withEmotionInFlightBatch(
      outbox('user-a', pendingCreate),
      pendingCreate,
    );
    const localDelete = localEmotionDriftBeyondOutbox({
      remote,
      local: remote,
      outbox: pending,
    });
    const merged = mergeEmotionOutbox({
      existing: pending,
      userId: 'user-a',
      expectedRevision: 4,
      mutations: localDelete,
      language: 'zh',
    });

    expect(merged.mutations.slice(0, pendingCreate.length)).toEqual(pendingCreate);
    expect(merged.mutations.slice(pendingCreate.length).map((mutation) => mutation.type))
      .toContain('record_soft_delete');
    expect(merged.inFlightBatch?.mutations).toEqual(pendingCreate);

    const createWasNotApplied = reconcileEmotionMutationsAfterRemoteAdvance({
      pendingMutations: merged.mutations,
      inFlightMutations: pendingCreate,
      remote,
    });
    expect(createWasNotApplied).toMatchObject({
      safeMutations: [], conflicts: [], appliedMutationIds: [],
    });

    const createWasApplied = reconcileEmotionMutationsAfterRemoteAdvance({
      pendingMutations: merged.mutations,
      inFlightMutations: pendingCreate,
      remote: created,
    });
    expect(createWasApplied.conflicts).toEqual([]);
    expect(createWasApplied.safeMutations).toHaveLength(1);
    expect(createWasApplied.safeMutations[0]).toMatchObject({
      type: 'record_soft_delete',
      entityId: created.records[0].momentId,
      base: created.records[0],
    });
    expect(applyEmotionMutationsToSnapshot(
      created,
      createWasApplied.safeMutations,
    ).records).toEqual([]);
  });

  it('rebases a trailing edit after the server canonicalizes a confirmed create', () => {
    const empty = normalized(createEmptyAppData());
    const draftApp = recordSnapshot();
    const draft = normalized(draftApp);
    const finalApp = structuredClone(draftApp);
    finalApp.moments[0].isNew = false;
    finalApp.moments[0].emotion = 'calm';
    finalApp.notes[0].title = '正式保存';
    finalApp.notes[0].titleSource = 'user';
    finalApp.notes[0].isDraft = false;
    finalApp.notes[0].emotion = 'calm';
    const final = normalized(finalApp);
    const confirmedCreate = diffEmotionState(empty, draft);
    const trailingSave = diffEmotionState(draft, final);
    const canonicalRemote = structuredClone(draft);
    canonicalRemote.records[0].longitude = Number(
      canonicalRemote.records[0].longitude.toFixed(14),
    );
    canonicalRemote.records[0].occurredAtUtc =
      canonicalRemote.records[0].occurredAtUtc?.replace('.000Z', '+00:00') ?? null;

    const reconciled = reconcileEmotionMutationsAfterRemoteAdvance({
      pendingMutations: trailingSave,
      inFlightMutations: [],
      confirmedMutations: confirmedCreate,
      remote: canonicalRemote,
    });

    expect(reconciled.conflicts).toEqual([]);
    expect(reconciled.safeMutations).toHaveLength(1);
    expect(reconciled.safeMutations[0]).toMatchObject({
      type: 'record_upsert',
      payload: { title: '正式保存', isDraft: false },
      base: canonicalRemote.records[0],
    });
  });

  it('uses the required isolated IndexedDB and per-account key path', () => {
    expect(EMOTION_SYNC_DB_NAME).toBe('my-emotion-map-sync-v2');
    expect(EMOTION_OUTBOX_STORE_NAME).toBe('emotion-mutation-outbox');
    const source = readFileSync(
      'src/services/normalizedSync/emotionOutbox.ts',
      'utf8',
    );
    expect(source).toContain("{ keyPath: 'userId' }");
    expect(source).toContain('emotion-sync-recovery');
  });

  it('never selects or merges an outbox across account boundaries', () => {
    const accountA = outbox('account-a');
    const accountB = outbox('account-b');
    accountA.sequence = 99;

    expect(emotionOutboxForUser(accountA, 'account-b')).toBeNull();
    expect(newestEmotionOutboxForUser(
      accountA, accountB, 'account-b',
    )).toBe(accountB);
    expect(mergeEmotionOutbox({
      existing: accountA,
      userId: 'account-b',
      expectedRevision: 8,
      mutations: [],
      language: 'en',
      now: 20,
    })).toMatchObject({
      userId: 'account-b', expectedRevision: 8, sequence: 1, mutations: [],
    });
  });

  it('compacts offline edits and persists the exact in-flight batch shape', () => {
    const first: EmotionMutation = {
      mutationId: 'first', type: 'settings_update', entityId: 'settings',
      payload: { themeTone: 'blue' }, base: { themeTone: 'original' },
      createdAt: 1,
    };
    const second: EmotionMutation = {
      ...first, mutationId: 'second', payload: { themeTone: 'mauve' },
      base: { themeTone: 'blue' }, createdAt: 2,
    };
    const merged = mergeEmotionOutbox({
      existing: outbox('account-a', [first]),
      userId: 'account-a', expectedRevision: 4, mutations: [second],
      language: 'zh', now: 20,
    });
    const withFlight = withEmotionInFlightBatch(merged, merged.mutations, 30);

    expect(merged.mutations).toEqual([{
      ...second, base: { themeTone: 'original' },
    }]);
    expect(withFlight.inFlightBatch).toEqual({
      expectedRevision: 4,
      mutations: structuredClone(merged.mutations),
      startedAt: 30,
    });
    expect(withFlight.sequence).toBe(merged.sequence + 1);
  });

  it('refuses to claim synchronization when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(writeEmotionMutationOutbox(outbox('account-a')))
      .rejects.toThrow('IndexedDB is unavailable');
  });

  it('converts legacy sync metadata without guessing an unreliable base', () => {
    const meta = {
      baseRevision: 7,
      baseHash: 'base',
      pendingRequestId: null,
      pendingPayloadHash: null,
      dirty: false,
      lastSyncedAt: null,
    };
    const input = {
      meta,
      remoteIsEmpty: false,
      localHasValidRecords: true,
      legacyArchiveExists: true,
    };

    expect(decideLegacySyncConversion({
      ...input, localHash: 'base', remoteHash: 'remote',
    })).toBe('load_remote');
    expect(decideLegacySyncConversion({
      ...input, localHash: 'local', remoteHash: 'base',
    })).toBe('enqueue_local');
    expect(decideLegacySyncConversion({
      ...input, localHash: 'same', remoteHash: 'same',
    })).toBe('already_equal');
    expect(decideLegacySyncConversion({
      ...input, localHash: 'local', remoteHash: 'remote',
    })).toBe('conflict');
    expect(decideLegacySyncConversion({
      ...input, meta: null, localHash: 'local', remoteHash: 'remote',
    })).toBe('conflict');
    expect(decideLegacySyncConversion({
      ...input,
      meta: null,
      localHash: 'local',
      remoteHash: 'empty',
      remoteIsEmpty: true,
      legacyArchiveExists: false,
    })).toBe('enqueue_local');
  });

  it('writes recovery and deletes an outbox in one IndexedDB transaction', () => {
    const source = readFileSync(
      'src/services/normalizedSync/emotionOutbox.ts',
      'utf8',
    );
    const atomicDiscard = source.slice(
      source.indexOf('export const discardEmotionOutboxAfterRecovery'),
      source.indexOf('export const decideLegacySyncConversion'),
    );
    expect(atomicDiscard).toContain(
      '[EMOTION_RECOVERY_STORE_NAME, EMOTION_OUTBOX_STORE_NAME]',
    );
    expect(atomicDiscard).toContain('.put(');
    expect(atomicDiscard).toContain('.delete(recovery.userId)');
  });
});

describe('entity-level conflict reconciliation', () => {
  it('rebases disjoint edits and identifies only the same entity as conflicting', () => {
    const base = normalized(recordSnapshot(2));
    const local = structuredClone(base);
    local.records[0].title = 'Local edit';
    const remoteDisjoint = structuredClone(base);
    remoteDisjoint.records[1].title = 'Remote edit';
    const localMutations = diffEmotionState(base, local);
    const disjoint = reconcileEmotionMutationsAfterRemoteAdvance({
      pendingMutations: localMutations,
      inFlightMutations: [],
      remote: remoteDisjoint,
    });
    expect(disjoint.safeMutations).toHaveLength(1);
    expect(disjoint.conflicts).toEqual([]);

    const remoteSame = structuredClone(base);
    remoteSame.records[0].title = 'Remote same-record edit';
    const same = reconcileEmotionMutationsAfterRemoteAdvance({
      pendingMutations: localMutations,
      inFlightMutations: [],
      remote: remoteSame,
    });
    expect(same.safeMutations).toEqual([]);
    expect(same.conflicts).toHaveLength(1);
    expect(same.conflicts[0].key).toContain(base.records[0].momentId);
  });

  it('recognizes a response-lost in-flight edit and rebases the newer local edit', () => {
    const base = normalized(recordSnapshot());
    const first = structuredClone(base);
    first.records[0].title = 'Server applied this';
    const second = structuredClone(first);
    second.records[0].title = 'Newer local edit';
    const inFlight = diffEmotionState(base, first);
    const pending = compactEmotionMutations([
      ...inFlight,
      ...diffEmotionState(first, second),
    ]);

    const result = reconcileEmotionMutationsAfterRemoteAdvance({
      pendingMutations: pending,
      inFlightMutations: inFlight,
      remote: first,
    });
    expect(result.conflicts).toEqual([]);
    expect(result.safeMutations).toHaveLength(1);
    expect(result.safeMutations[0]).toMatchObject({
      base: expect.objectContaining({ title: 'Server applied this' }),
      payload: expect.objectContaining({ title: 'Newer local edit' }),
    });
  });

  it('safe merge copies a conflicting record with new moment and note IDs', () => {
    const base = normalized(recordSnapshot());
    const local = structuredClone(base);
    local.records[0].title = 'Local title';
    const remote = structuredClone(base);
    remote.records[0].title = 'Remote title';
    const result = preserveEmotionMutationConflicts({
      pendingMutations: diffEmotionState(base, local),
      remote,
      language: 'zh',
    });
    const copy = result.mutations.find((item) => item.type === 'record_upsert');

    expect(copy?.entityId).not.toBe(base.records[0].momentId);
    expect(copy?.payload).toMatchObject({ title: 'Local title（本机冲突副本）' });
    expect(copy?.payload?.momentId).not.toBe(base.records[0].momentId);
    expect(copy?.payload?.noteId).not.toBe(base.records[0].noteId);
    expect(result.recovery[0].reason).toBe('same-record-copied');
  });

  it('safe merge preserves remote edits instead of applying a local delete', () => {
    const base = normalized(recordSnapshot());
    const local = structuredClone(base);
    local.records = [];
    const remote = structuredClone(base);
    remote.records[0].title = 'Remote edit survives';
    const pending = diffEmotionState(base, local);

    const safe = preserveEmotionMutationConflicts({ pendingMutations: pending, remote });
    const localWins = keepLocalEmotionConflicts({ pendingMutations: pending, remote });

    expect(safe.mutations).toEqual([]);
    expect(safe.recovery[0].reason).toBe('local-delete-preserved-remotely');
    expect(localWins).toHaveLength(1);
    expect(localWins[0]).toMatchObject({
      type: 'record_soft_delete',
      base: expect.objectContaining({ title: 'Remote edit survives' }),
    });
  });

  it('copies a same-ID message as stopped but does not duplicate unique request IDs', () => {
    const source = createEmptyAppData();
    source.conversations = [{
      id: 'chat', title: 'Chat', preview: '', kind: 'regular', messages: [{
        id: 'message', role: 'assistant', body: 'Base',
        deliveryState: 'delivered', requestId: 'request-1',
      }],
    }];
    const base = normalized(source);
    const local = structuredClone(base);
    local.messages[0].body = 'Local';
    const remote = structuredClone(base);
    remote.messages[0].body = 'Remote';
    const copied = preserveEmotionMutationConflicts({
      pendingMutations: diffEmotionState(base, local), remote,
    });
    expect(copied.mutations[0].payload).toMatchObject({
      body: 'Local', deliveryState: 'stopped',
    });
    expect(copied.mutations[0].entityId).not.toBe('message');

    const localNew = structuredClone(base);
    localNew.messages.push({
      ...localNew.messages[0], id: 'local-duplicate', sortOrder: 1,
    });
    const unique = preserveEmotionMutationConflicts({
      pendingMutations: diffEmotionState(base, localNew), remote: base,
    });
    expect(unique.mutations).toEqual([]);
    expect(unique.recovery[0].reason).toBe('remote-canonical');
  });

  it('never revives terminal follow-ups and keeps only the earliest active slot', () => {
    const source = recordSnapshot();
    const noteId = source.notes[0].id;
    const followUp = (
      id: string,
      dueAt: string,
      status: FollowUpRecord['status'],
    ): FollowUpRecord => ({
      id, noteId, intervalDays: 3, dueAt, status,
    });
    source.followUps = [followUp('existing', '2026-08-04T09:00:00.000Z', 'active')];
    const base = normalized(source);
    const local = structuredClone(base);
    local.followUps[0].status = 'answered';
    const remoteTerminal = structuredClone(base);
    remoteTerminal.followUps[0].status = 'skipped';
    const terminal = preserveEmotionMutationConflicts({
      pendingMutations: diffEmotionState(base, local), remote: remoteTerminal,
    });
    expect(terminal.mutations).toEqual([]);
    expect(terminal.recovery[0].reason).toBe('terminal-followup-conflict');

    const localActive = structuredClone(base);
    localActive.followUps.push({
      ...followUp('later', '2026-08-04T10:00:00.000Z', 'active'),
      sortOrder: 1,
    });
    const slots = preserveEmotionMutationConflicts({
      pendingMutations: diffEmotionState(base, localActive), remote: base,
    });
    expect(slots.mutations.find((item) => item.entityId === 'later')?.payload)
      .toMatchObject({ status: 'queued' });
  });

  it('keeps the remote revisit when sourceFollowUpId would violate uniqueness', () => {
    const source = recordSnapshot();
    const noteId = source.notes[0].id;
    const base = normalized(source);
    const local = structuredClone(base);
    local.revisits.push({
      id: 'local-revisit', noteId, originalEmotion: null,
      changeDirection: 'same', originalOccurredAt: '2026-08-01T00:00:00.000Z',
      revisitedAt: '2026-08-04T00:00:00.000Z',
      sourceFollowUpId: 'follow-up-1', sortOrder: 0,
    });
    const remote = structuredClone(base);
    remote.revisits.push({
      ...local.revisits[0], id: 'remote-revisit', changeDirection: 'lighter',
    });
    const result = preserveEmotionMutationConflicts({
      pendingMutations: diffEmotionState(base, local), remote,
    });

    expect(result.mutations).toEqual([]);
    expect(result.recovery[0].reason).toBe('revisit-uniqueness-conflict');
  });

  it('merges disjoint settings fields and recovers same-field conflicts', () => {
    const base = normalized(recordSnapshot());
    const local = structuredClone(base);
    local.settings.themeTone = 'blue';
    local.settings.themePalette.dark = '#111111';
    const remote = structuredClone(base);
    remote.settings.themePalette.page = '#222222';
    remote.settings.themePalette.dark = '#333333';
    const result = preserveEmotionMutationConflicts({
      pendingMutations: diffEmotionState(base, local), remote,
    });
    const payload = result.mutations.find(
      (item) => item.type === 'settings_update',
    )?.payload;

    expect(payload).toMatchObject({
      themeTone: 'blue',
      themePalette: expect.objectContaining({ page: '#222222', dark: '#333333' }),
    });
    expect(result.recovery).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'field-conflict', field: 'themePalette' }),
    ]));
  });

  it('keeps empty conflict input stable', () => {
    const remote: NormalizedEmotionSnapshot = normalized(createEmptyAppData());
    expect(preserveEmotionMutationConflicts({
      pendingMutations: [], remote,
    })).toEqual({ mutations: [], recovery: [], appliedMutationIds: [] });
  });
});
