import { describe, expect, it } from 'vitest';
import {
  createEmptyAppData,
  migrateAppData,
  validateReferentialIntegrity,
} from '../../src/app/appDataRepository';
import { createDefaultLocalSettings } from '../../src/app/profilePreferences';
import { createRecord } from '../../src/app/recordFactory';
import {
  assembleNormalizedEmotionSnapshot,
  normalizeEmotionSnapshot,
  recordSharedFieldsDiverged,
} from '../../src/domain/storage/normalizedEmotionSnapshot';
import {
  applyEmotionMutationsToSnapshot,
  compactEmotionMutations,
  diffEmotionState,
  emotionMutationKey,
  toEmotionWireMutation,
} from '../../src/services/normalizedSync/emotionMutationModel';
import {
  validateEmotionMutation,
} from '../../src/services/normalizedSync/emotionMutationValidation';
import type {
  EmotionMutation,
  NormalizedEmotionSnapshot,
} from '../../src/services/normalizedSync/emotionSyncTypes';
import type { AppDataSnapshot, EmotionNote } from '../../src/types';

const settings = () => createDefaultLocalSettings();

const buildRecord = (overrides: Parameters<typeof createRecord>[0] = {
  longitude: 121.544,
  latitude: 29.8683,
  place: 'Ningbo',
  language: 'zh',
  source: 'manual',
}) => createRecord(overrides);

const normalize = (snapshot: AppDataSnapshot) =>
  normalizeEmotionSnapshot(snapshot, settings());

const withOneRecord = () => {
  const { moment, note } = buildRecord();
  return {
    ...createEmptyAppData(),
    moments: [moment],
    notes: [note],
  };
};

describe('normalized emotion snapshot mapping', () => {
  it('round-trips an empty account without inventing entities', () => {
    const result = normalize(createEmptyAppData());
    const assembled = assembleNormalizedEmotionSnapshot(result.snapshot);

    expect(result.issues).toEqual([]);
    expect(result.recovery).toEqual([]);
    expect(assembled).toEqual(createEmptyAppData());
  });

  it('round-trips one unfinished draft star and preserves null emotion', () => {
    const source = withOneRecord();
    const result = normalize(source);
    const assembled = assembleNormalizedEmotionSnapshot(result.snapshot);

    expect(result.snapshot.records).toHaveLength(1);
    expect(result.snapshot.records[0]).toMatchObject({
      emotion: null,
      intensity: 0,
      isNew: true,
      isDraft: true,
    });
    expect(assembled.moments[0]).toMatchObject({
      emotion: null,
      intensity: 0,
      noteId: assembled.notes[0].id,
    });
    expect(recordSharedFieldsDiverged(
      assembled.moments[0], assembled.notes[0],
    )).toBe(false);
  });

  it('round-trips one private note image as metadata instead of inline bytes', () => {
    const source = withOneRecord();
    const image = {
      provider: 'supabase' as const,
      bucket: 'emotion-note-images' as const,
      path: '00000000-0000-4000-8000-000000000001/notes/note-1/image-1.jpg',
      mimeType: 'image/jpeg' as const,
      size: 345_678,
      width: 1200,
      height: 900,
      createdAt: 1_786_000_000_000,
    };
    source.notes[0] = { ...source.notes[0], image };

    const result = normalize(source);
    const assembled = assembleNormalizedEmotionSnapshot(result.snapshot);

    expect(result.snapshot.records[0].image).toEqual(image);
    expect(assembled.notes[0].image).toEqual(image);
    expect(JSON.stringify(result.snapshot.records[0])).not.toContain('base64');
    expect(() => validateEmotionMutation(
      diffEmotionState(normalize(withOneRecord()).snapshot, result.snapshot)[0],
    )).not.toThrow();
  });

  it.each([
    {
      name: 'photo EXIF with offset',
      eventTimestamp: '2026-08-04T14:30:00+09:00',
      expectedUtc: '2026-08-04T05:30:00.000Z',
      expectedZone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    },
    {
      name: 'photo EXIF without offset',
      eventTimestamp: '2026-08-04T14:30:00',
      expectedUtc: null,
      expectedZone: null,
    },
  ])('preserves $name semantics', ({ eventTimestamp, expectedUtc, expectedZone }) => {
    const { moment, note } = buildRecord({
      longitude: 139.7,
      latitude: 35.6,
      place: 'Tokyo',
      language: 'zh',
      source: 'photo',
      date: '2026-08-04',
      time: '14:30',
      eventTimeSource: 'photo-exif',
      eventTimestamp,
    });
    const result = normalize({
      ...createEmptyAppData(), moments: [moment], notes: [note],
    });
    const assembled = assembleNormalizedEmotionSnapshot(result.snapshot);

    expect(assembled.moments[0].occurredAtUtc).toBe(expectedUtc);
    expect(assembled.moments[0].timeZone).toBe(expectedZone);
    expect(assembled.notes[0].occurredAtUtc).toBe(expectedUtc);
    expect(assembled.notes[0].timeZone).toBe(expectedZone);
  });

  it('records shared-field divergence and lets a formal note repair hidden draft defaults', () => {
    const source = withOneRecord();
    source.notes[0] = {
      ...source.notes[0],
      place: 'Formal place',
      emotion: 'joy',
      placeRating: 'comfortable',
      color: '#112233',
      isDraft: false,
    };
    const result = normalize(source);
    const assembled = assembleNormalizedEmotionSnapshot(result.snapshot);

    expect(result.issues).toContain('record-shared-fields-diverged');
    expect(result.recovery[0]).toMatchObject({
      reason: 'record-shared-fields-diverged',
      canonicalSource: 'note',
    });
    expect(result.snapshot.records[0]).toMatchObject({
      place: 'Formal place', emotion: 'joy', placeRating: 'comfortable',
    });
    expect(recordSharedFieldsDiverged(
      assembled.moments[0], assembled.notes[0],
    )).toBe(false);
  });

  it('does not silently lose a real shared-field conflict', () => {
    const source = withOneRecord();
    source.moments[0] = { ...source.moments[0], isNew: undefined };
    source.notes[0] = { ...source.notes[0], place: 'Different input' };
    const result = normalize(source);

    expect(result.snapshot.records[0].place).toBe(source.moments[0].place);
    expect(result.recovery[0]).toMatchObject({
      reason: 'record-shared-fields-diverged', canonicalSource: 'moment',
    });
    expect(result.recovery[0].note?.place).toBe('Different input');
  });

  it('detects duplicate IDs, recovers a missing note, and preserves an orphan note for recovery', () => {
    const source = withOneRecord();
    const other = buildRecord();
    const orphan: EmotionNote = { ...other.note, id: 'orphan-note' };
    source.moments.push(
      { ...other.moment, id: source.moments[0].id },
      { ...other.moment, id: 'missing-note-moment', noteId: 'missing-note' },
    );
    source.notes.push({ ...source.notes[0] }, orphan);
    const result = normalize(source);

    expect(result.issues).toEqual(expect.arrayContaining([
      'duplicate-moment-id', 'duplicate-note-id', 'missing-note', 'missing-moment',
    ]));
    expect(result.snapshot.records.find(
      (record) => record.momentId === 'missing-note-moment',
    )).toMatchObject({ noteId: 'missing-note', isDraft: true });
    expect(result.recovery.find(
      (item) => item.reason === 'missing-moment' && item.noteId === 'orphan-note',
    )?.note).toEqual(orphan);
  });

  it('derives conversation preview and excludes pending AI messages', () => {
    const source = createEmptyAppData();
    source.conversations = [{
      id: 'chat', title: 'Chat', preview: 'stale preview', kind: 'regular',
      messages: [
        { id: 'safe', role: 'assistant', body: 'saved body', deliveryState: 'delivered' },
        { id: 'pending', role: 'user', body: 'not uploaded', deliveryState: 'pending' },
      ],
    }];
    const normalized = normalize(source).snapshot;
    const assembled = assembleNormalizedEmotionSnapshot(normalized);

    expect(normalized.conversations[0]).not.toHaveProperty('preview');
    expect(normalized.messages.map((message) => message.id)).toEqual(['safe']);
    expect(assembled.conversations[0].preview).toBe('saved body');
  });

  it('keeps future-schema and Demo rejection at the compatibility entrance', () => {
    const empty = createEmptyAppData();
    expect(migrateAppData({
      ...empty, schemaVersion: empty.schemaVersion + 1,
    })).toMatchObject({ status: 'upgrade_required' });
    expect(migrateAppData({ ...empty, dataMode: 'demo' })).toEqual({
      status: 'invalid', issues: ['demo-snapshot-rejected'],
    });
  });

  it('assembles and diffs 5000 records with Map-based entity lookup', () => {
    const source = createEmptyAppData();
    for (let index = 0; index < 5_000; index += 1) {
      const { moment, note } = buildRecord({
        longitude: 120 + index / 100_000,
        latitude: 30 + index / 100_000,
        place: `Place ${index}`,
        language: 'en',
        source: 'manual',
      });
      source.moments.push(moment);
      source.notes.push(note);
    }
    const base = normalize(source).snapshot;
    const next = structuredClone(base);
    next.records[4_999].title = 'Only this record changed';

    const samples = Array.from({ length: 5 }, () => {
      const startedAt = performance.now();
      const mutations = diffEmotionState(base, next);
      const assembled = assembleNormalizedEmotionSnapshot(next);
      return {
        durationMs: performance.now() - startedAt,
        mutations,
        assembled,
      };
    }).sort((left, right) => left.durationMs - right.durationMs);
    const measured = samples[Math.ceil(samples.length * 0.95) - 1];
    const { mutations, assembled } = measured;
    console.info(`[perf] normalized 5000 records assemble+diff p95=${measured.durationMs.toFixed(2)}ms`);

    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({
      type: 'record_upsert', entityId: next.records[4_999].momentId,
    });
    expect(assembled.moments).toHaveLength(5_000);
    expect(assembled.notes).toHaveLength(5_000);
  }, 10_000);

  it('assembles and diffs 10000 messages without resending the workspace', () => {
    const base = normalize(createEmptyAppData()).snapshot;
    base.conversations.push({
      id: 'conversation-large', sortOrder: 0, title: 'Large',
      unread: false, proactive: false, kind: 'regular',
    });
    base.messages = Array.from({ length: 10_000 }, (_, index) => ({
      id: `message-${index}`,
      conversationId: 'conversation-large',
      sortOrder: index,
      role: index % 2 ? 'assistant' as const : 'user' as const,
      body: `message ${index}`,
      kind: 'message' as const,
      deliveryState: 'delivered' as const,
    }));
    const next = structuredClone(base);
    next.messages[9_999].body = 'one changed message';
    const samples = Array.from({ length: 5 }, () => {
      const startedAt = performance.now();
      const mutations = diffEmotionState(base, next);
      const assembled = assembleNormalizedEmotionSnapshot(next);
      return {
        durationMs: performance.now() - startedAt,
        mutations,
        assembled,
      };
    }).sort((left, right) => left.durationMs - right.durationMs);
    const measured = samples[Math.ceil(samples.length * 0.95) - 1];
    console.info(`[perf] normalized 10000 messages assemble+diff p95=${measured.durationMs.toFixed(2)}ms`);

    expect(measured.mutations).toHaveLength(1);
    expect(measured.mutations[0]).toMatchObject({
      type: 'message_upsert', entityId: 'message-9999',
    });
    expect(measured.assembled.conversations[0].messages).toHaveLength(10_000);
  }, 10_000);
});

const mutation = (
  overrides: Partial<EmotionMutation> & Pick<EmotionMutation, 'type' | 'entityId'>,
): EmotionMutation => ({
  mutationId: `mutation-${overrides.entityId}-${overrides.createdAt ?? 1}`,
  createdAt: 1,
  ...overrides,
});

describe('normalized emotion mutation model', () => {
  it('changes only the edited record and applies the result', () => {
    const base = normalize(withOneRecord()).snapshot;
    const next = structuredClone(base);
    next.records[0].title = 'Edited title';

    const changes = diffEmotionState(base, next);
    expect(changes.map((item) => item.type)).toEqual(['record_upsert']);
    expect(applyEmotionMutationsToSnapshot(base, changes)).toEqual(next);
  });

  it('rejects inline or cross-format image data in a record mutation', () => {
    const base = normalize(withOneRecord()).snapshot;
    const record = structuredClone(base.records[0]);
    const change = mutation({
      type: 'record_upsert',
      entityId: record.momentId,
      payload: {
        ...record,
        image: { src: 'data:image/jpeg;base64,unsafe-inline-content' },
      },
      base: record,
    });
    expect(() => validateEmotionMutation(change)).toThrow(/image metadata/i);
  });

  it('keeps the latest upsert payload and the earliest base', () => {
    const first = mutation({
      type: 'record_upsert', entityId: 'record', createdAt: 1,
      base: { title: 'base' }, payload: { title: 'first' },
    });
    const second = mutation({
      type: 'record_upsert', entityId: 'record', createdAt: 2,
      base: { title: 'first' }, payload: { title: 'second' },
    });

    expect(compactEmotionMutations([first, second])).toEqual([{
      ...second, base: { title: 'base' },
    }]);
  });

  it('cancels create-then-delete before sync', () => {
    const added = mutation({
      type: 'record_upsert', entityId: 'new', base: null,
      payload: { momentId: 'new' }, createdAt: 1,
    });
    const removed = mutation({
      type: 'record_soft_delete', entityId: 'new',
      base: { momentId: 'new' }, createdAt: 2,
    });
    expect(compactEmotionMutations([added, removed])).toEqual([]);
  });

  it('compresses existing upsert-delete and delete-recreate correctly', () => {
    const original = { momentId: 'record', title: 'base' };
    const edited = { momentId: 'record', title: 'edit' };
    const upsert = mutation({
      type: 'record_upsert', entityId: 'record', payload: edited,
      base: original, createdAt: 1,
    });
    const removed = mutation({
      type: 'record_soft_delete', entityId: 'record', base: edited,
      createdAt: 2,
    });
    expect(compactEmotionMutations([upsert, removed])).toEqual([{
      ...removed, base: original,
    }]);

    const recreated = mutation({
      type: 'record_upsert', entityId: 'record',
      payload: { momentId: 'record', title: 'new' }, base: null, createdAt: 3,
    });
    expect(compactEmotionMutations([removed, recreated])).toEqual([{
      ...recreated, base: edited,
    }]);
  });

  it('does not merge different entities or revive a terminal follow-up', () => {
    const answered = mutation({
      type: 'followup_upsert', entityId: 'followup', createdAt: 1,
      base: { status: 'active' }, payload: { status: 'answered' },
    });
    const staleActive = mutation({
      type: 'followup_upsert', entityId: 'followup', createdAt: 2,
      base: { status: 'answered' }, payload: { status: 'active' },
    });
    const other = mutation({
      type: 'followup_upsert', entityId: 'other', createdAt: 3,
      base: { status: 'queued' }, payload: { status: 'active' },
    });
    const compacted = compactEmotionMutations([answered, staleActive, other]);

    expect(compacted).toHaveLength(2);
    expect(compacted.find((item) => item.entityId === 'followup')).toEqual(answered);
    expect(emotionMutationKey(other)).toBe('followup:other');
  });

  it('sends synchronized preferences but never local mutation metadata or credentials', () => {
    const change = mutation({
      type: 'preferences_update', entityId: 'preferences',
      payload: {
        avatarSrc: 'data:image/png;base64,cHJvZmlsZQ==',
        profileName: 'Kaki', language: 'ko', aboutMe: '', aiUserPrompt: '',
        aiContextMessageCount: 8, chatPreferenceTags: [],
        followUpIntervals: [3, 7, 14],
      },
      base: null,
    });
    expect(toEmotionWireMutation(change)).toEqual({
      type: change.type, entityId: change.entityId, payload: change.payload,
    });
    expect(toEmotionWireMutation(change)).not.toHaveProperty('mutationId');
    expect(toEmotionWireMutation(change)).not.toHaveProperty('base');
    expect(() => validateEmotionMutation(change)).not.toThrow();

    expect(() => validateEmotionMutation({
      ...change,
      payload: { ...change.payload, profileId: 'private-profile-id' },
    })).toThrow(/Sensitive fields/);
  });

  it('reports shared-field divergence through canonical validation', () => {
    const source = withOneRecord();
    source.notes[0] = { ...source.notes[0], place: 'Diverged' };
    expect(validateReferentialIntegrity(source)).toContain(
      'record-shared-fields-diverged',
    );
  });

  it('keeps empty normalized snapshots stable under apply', () => {
    const empty: NormalizedEmotionSnapshot = normalize(
      createEmptyAppData(),
    ).snapshot;
    expect(applyEmotionMutationsToSnapshot(empty, [])).toEqual(empty);
  });
});
