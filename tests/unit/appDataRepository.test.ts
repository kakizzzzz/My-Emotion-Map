import { beforeEach, describe, expect, it } from 'vitest';
import {
  APP_DATA_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  createDemoAppData,
  createEmptyAppData,
  dismissInboxItem,
  isValidCoordinate,
  isValidDate,
  loadAppData,
  migrateAppData,
  parseImportedAppData,
  removeMomentAssociations,
  saveAppData,
} from '../../src/app/appDataRepository';
import { DEMO_DATA_MANIFEST } from '../../src/app/demoData';
import {
  legacyUserWorkspaceStorageKey,
  userWorkspaceStorageKey,
} from '../../src/app/workspace/workspaceStorage';
import type {
  AppDataSnapshot,
  EmotionMoment,
  EmotionNote,
} from '../../src/types';

const note: EmotionNote = {
  id: 'note-1',
  title: 'Quiet library',
  place: 'Library',
  date: '2026-07-28',
  time: '14:20',
  emotion: 'calm',
  placeRating: 'safe',
  answers: [{ id: 'answer-1', question: 'What happened?', answer: 'Read.' }],
  excerpt: 'Read.',
  isDraft: false,
  followUpEnabled: true,
};

const moment: EmotionMoment = {
  id: 'moment-1',
  noteId: note.id,
  emotion: note.emotion,
  intensity: 3,
  place: note.place,
  date: note.date,
  time: note.time,
  latitude: 37.55,
  longitude: 126.95,
  placeRating: note.placeRating,
  source: 'manual',
};

function populatedSnapshot(): AppDataSnapshot {
  return {
    ...createEmptyAppData(),
    moments: [moment],
    notes: [note],
    conversations: [
      {
        id: 'thread-revisit',
        title: 'Follow-up',
        preview: '',
        kind: 'companion',
        messages: [
          {
            id: 'message-1',
            role: 'assistant',
            body: 'Review',
            noteIds: [note.id],
            followUpId: 'follow-up-1',
          },
        ],
      },
    ],
    followUps: [
      {
        id: 'follow-up-1',
        noteId: note.id,
        intervalDays: 3,
        dueAt: '2026-07-31T14:20:00.000Z',
        status: 'queued',
        prompt: 'Review?',
      },
    ],
    revisits: [
      {
        id: 'revisit-1',
        noteId: note.id,
        originalEmotion: 'calm',
        changeDirection: 'different',
        currentEmotion: 'joy',
        originalOccurredAt: '2026-07-28T14:20:00.000Z',
        revisitedAt: '2026-07-29T14:20:00.000Z',
      },
    ],
  };
}

const migrateOk = (value: unknown) => {
  const result = migrateAppData(value);
  if (result.status !== 'ok') {
    throw new Error(`Expected an upgradable snapshot, received ${result.status}`);
  }
  return result;
};

describe('app data repository', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts a fresh signed-in workspace as empty real data', () => {
    const loaded = loadAppData('user-a');

    expect(loaded.dataMode).toBe('real');
    expect(loaded.moments).toEqual([]);
    expect(loaded.notes).toEqual([]);
  });

  it('does not silently assign the unowned legacy snapshot to a user', () => {
    const legacy = {
      moments: [moment],
      notes: [note],
      conversations: [],
      followUps: [],
      starInboxItems: [],
    };
    window.localStorage.setItem(APP_DATA_STORAGE_KEY, JSON.stringify(legacy));

    const loaded = loadAppData('user-a');

    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.dataMode).toBe('real');
    expect(loaded.moments).toEqual([]);
    expect(window.localStorage.getItem(APP_DATA_STORAGE_KEY)).not.toBeNull();
  });

  it('migrates a snapshot stored in the resolved user workspace', () => {
    window.localStorage.setItem(
      userWorkspaceStorageKey('user-a'),
      JSON.stringify({
        moments: [moment], notes: [note], conversations: [], followUps: [],
        revisits: [], starInboxItems: [], dataMode: 'real',
      }),
    );
    const loaded = loadAppData('user-a');
    expect(loaded.moments).toHaveLength(1);
    expect(loaded.notes[0].title).toBe(note.title);
    expect(loaded.moments[0].occurredAtUtc).toBeNull();
  });

  it('loads the legacy v4 user key without deleting the recovery source', () => {
    const legacyKey = legacyUserWorkspaceStorageKey('user-a');
    const raw = JSON.stringify({ ...populatedSnapshot(), schemaVersion: 4 });
    window.localStorage.setItem(legacyKey, raw);

    const loaded = loadAppData('user-a');

    expect(loaded.schemaVersion).toBe(6);
    expect(loaded.notes[0].id).toBe(note.id);
    expect(window.localStorage.getItem(legacyKey)).toBe(raw);
  });

  it('clears hidden legacy defaults without rewriting formal choices', () => {
    const hiddenNote = {
      ...note,
      id: 'hidden-note',
      emotion: 'mixed',
      placeRating: 'neutral',
      isDraft: true,
    };
    const hiddenMoment = {
      ...moment,
      id: 'hidden-moment',
      noteId: hiddenNote.id,
      emotion: 'mixed',
      placeRating: 'neutral',
      isNew: true,
    };
    const formalNote = { ...note, emotion: 'mixed', placeRating: 'neutral' };
    const formalMoment = { ...moment, emotion: 'mixed', placeRating: 'neutral' };

    const migrated = migrateOk({
      schemaVersion: 2,
      dataMode: 'real',
      moments: [hiddenMoment, formalMoment],
      notes: [hiddenNote, formalNote],
      conversations: [],
      followUps: [],
      revisits: [],
      starInboxItems: [],
    });

    expect(migrated.snapshot.moments[0]).toMatchObject({
      emotion: null,
      placeRating: null,
      intensity: 0,
    });
    expect(migrated.snapshot.moments[1]).toMatchObject({
      emotion: 'mixed',
      placeRating: 'neutral',
    });
    expect(
      migrateOk(migrated.snapshot).snapshot,
    ).toEqual(migrated.snapshot);
  });

  it('recovers from damaged JSON to a visible-safe empty state', () => {
    window.localStorage.setItem(userWorkspaceStorageKey('user-a'), '{broken');

    const loaded = loadAppData('user-a');

    expect(loaded.loadIssue).toBe('corrupt-json');
    expect(loaded.dataMode).toBe('real');
    expect(loaded.moments).toEqual([]);
  });

  it('hard-stops snapshots from a future schema without downgrading them', () => {
    const future = {
      ...populatedSnapshot(),
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      futureOnlyField: { mustSurvive: true },
    };
    const original = JSON.stringify(future);

    const migrated = migrateAppData(future) as unknown as {
      status?: string;
      sourceVersion?: number;
      snapshot?: AppDataSnapshot;
    };

    expect(migrated).toMatchObject({
      status: 'upgrade_required',
      sourceVersion: CURRENT_SCHEMA_VERSION + 1,
    });
    expect(migrated).not.toHaveProperty('snapshot');
    expect(JSON.stringify(future)).toBe(original);
  });

  it('keeps schema-v6 external evidence without treating it as a local note', () => {
    const snapshot = populatedSnapshot();
    snapshot.conversations[0].messages[0].externalEvidence = [{
      referenceId: 'mlm-note-1', title: 'Campus walk', date: '2026-08-01',
      place: 'Dongguk University', matchReason: 'my_life_memory:research',
      source: 'my_life_memory_external',
    }];
    const migrated = migrateOk(snapshot).snapshot;
    expect(migrated.schemaVersion).toBe(6);
    expect(migrated.conversations[0].messages[0].externalEvidence)
      .toEqual([expect.objectContaining({ referenceId: 'mlm-note-1' })]);
    expect(migrated.notes).toHaveLength(1);
  });

  it('migrates a v4 revisit into schema v5 direction without losing its emotion', () => {
    const migrated = migrateAppData({
      ...populatedSnapshot(),
      schemaVersion: 4,
      revisits: [{
        id: 'revisit-old', noteId: note.id, originalEmotion: 'calm',
        revisitedEmotion: 'joy',
        originalOccurredAt: '2026-07-28T14:20:00.000Z',
        revisitedAt: '2026-07-29T14:20:00.000Z',
        sourceFollowUpId: 'followup-1',
      }],
    });
    expect(migrated.status).toBe('ok');
    if (migrated.status !== 'ok') return;
    expect(migrated.snapshot.schemaVersion).toBe(6);
    expect(migrated.snapshot.revisits[0]).toMatchObject({
      changeDirection: 'different', currentEmotion: 'joy',
    });
    expect(migrated.snapshot.revisits[0]).not.toHaveProperty('revisitedEmotion');
  });

  it('rejects a future-schema import instead of returning a downgraded snapshot', () => {
    const text = JSON.stringify({
      ...populatedSnapshot(),
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      futureOnlyField: 'preserve-in-original-file',
    });

    expect(parseImportedAppData(text)).toEqual({
      ok: false,
      issue: 'upgrade-required',
      sourceVersion: CURRENT_SCHEMA_VERSION + 1,
    });
  });

  it('keeps a future-schema local workspace untouched and blocks loading it', () => {
    const key = userWorkspaceStorageKey('user-a');
    const raw = JSON.stringify({
      ...populatedSnapshot(),
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      futureOnlyField: ['keep', 'every', 'value'],
    });
    window.localStorage.setItem(key, raw);

    const loaded = loadAppData('user-a');

    expect(loaded.loadIssue).toBe('upgrade-required');
    expect(loaded.moments).toEqual([]);
    expect(loaded.notes).toEqual([]);
    expect(window.localStorage.getItem(key)).toBe(raw);
  });

  it('validates calendar dates and coordinate bounds', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2025-02-29')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidCoordinate(90, -180)).toBe(true);
    expect(isValidCoordinate(90.01, 0)).toBe(false);
    expect(isValidCoordinate(0, 180.01)).toBe(false);
  });

  it('drops only invalid records instead of rejecting the whole import', () => {
    const invalidMoment = { ...moment, id: 'invalid', latitude: 120 };
    const migrated = migrateOk({
      ...populatedSnapshot(),
      moments: [moment, invalidMoment],
    });

    expect(migrated.snapshot.moments.map((item) => item.id)).toEqual([
      moment.id,
    ]);
    expect(migrated.snapshot.notes).toHaveLength(1);
    expect(migrated.issues).toContain('moment-dropped');
  });

  it('keeps empty real data separate from explicit demo data', () => {
    const empty = createEmptyAppData();
    const demo = createDemoAppData();

    expect(empty.dataMode).toBe('real');
    expect(empty.moments).toEqual([]);
    expect(empty.conversations).toEqual([]);
    expect(empty.starInboxItems).toEqual([]);
    expect(demo.dataMode).toBe('demo');
    expect(demo.moments.length).toBeGreaterThan(0);
    expect(demo.moments.every((item) =>
      item.latitude >= 37.557 && item.latitude <= 37.56 &&
      item.longitude >= 126.998 && item.longitude <= 127.002
    )).toBe(true);
    expect(demo.notes.map((item) => item.place)).toEqual([
      '东国大学中央图书馆',
      '万海广场',
      '惠化馆走廊',
      '东国大学学生会馆',
      '东国大学八正道',
    ]);
    expect(demo.notes.every((item) => item.emotion !== null)).toBe(true);
    expect(DEMO_DATA_MANIFEST).toMatchObject({
      sourceType: 'synthetic_demo',
      sourceId: 'campus-day',
      recordCount: 5,
    });
    expect(demo.notes).toHaveLength(5);
    expect(demo.notes.every((item) =>
      item.id.startsWith('demo:synthetic:campus-day:')
    )).toBe(true);
    expect(JSON.stringify(demo)).not.toMatch(/demo:mlm|my life memory|公开演示记录/i);
    expect(demo.starInboxItems).toEqual([]);
  });

  it('persists inbox dismissal as data state', () => {
    const items = [{
      id: 'inbox-1', source: 'heart-rate' as const, sourceEventId: 'event-1',
      eventAt: '2026-07-28T14:00:00.000Z', receivedAt: '2026-07-28T14:00:01.000Z',
      heartRate: 120, status: 'pending' as const,
    }];
    const next = dismissInboxItem(
      items,
      items[0].id,
      '2026-07-28T15:00:00.000Z',
    );

    expect(next[0].status).toBe('dismissed');
    expect(next[0].seenAt).toBe('2026-07-28T15:00:00.000Z');
    expect(items[0].status).toBe('pending');
  });

  it('deletes note, revisit, follow-up and conversation references together', () => {
    const next = removeMomentAssociations({
      ...populatedSnapshot(),
      starInboxItems: [{
        id: 'inbox-linked', source: 'heart-rate', sourceEventId: 'event-linked',
        eventAt: '2026-07-28T14:00:00.000Z', receivedAt: '2026-07-28T14:01:00.000Z',
        heartRate: 120, status: 'completed', linkedMomentId: moment.id,
        latitude: 37.55, longitude: 126.95,
        locationCapturedAt: '2026-07-28T14:02:00.000Z',
        locationAccuracyMeters: 12, locationTimeRelation: 'confirmation',
        confirmedAt: '2026-07-28T14:03:00.000Z',
      }],
    }, moment.id);

    expect(next.moments).toEqual([]);
    expect(next.notes).toEqual([]);
    expect(next.revisits).toEqual([]);
    expect(next.followUps).toEqual([]);
    expect(next.conversations[0].messages).toEqual([]);
    expect(next.starInboxItems[0]).toMatchObject({ status: 'pending' });
    for (const key of [
      'linkedMomentId', 'confirmedAt', 'latitude', 'longitude',
      'locationCapturedAt', 'locationAccuracyMeters', 'locationTimeRelation',
    ]) {
      expect(next.starInboxItems[0]).not.toHaveProperty(key);
    }
  });

  it('isolates account A and B storage keys', () => {
    const a = populatedSnapshot();
    expect(saveAppData(a, 'user-a')).toBe(true);
    expect(loadAppData('user-a').moments).toHaveLength(1);
    expect(loadAppData('user-b').moments).toEqual([]);
  });

  it('keeps the real camera snapshot intact while Demo uses its own workspace', () => {
    const real = {
      ...populatedSnapshot(),
      lastViewport: { longitude: 121.49, latitude: 31.23, zoom: 13.5 },
    };
    expect(saveAppData(real, 'user-a')).toBe(true);
    expect(saveAppData(createDemoAppData(), 'user-a')).toBe(true);
    expect(loadAppData('user-a', 'real').lastViewport).toEqual(real.lastViewport);
    expect(loadAppData('user-a', 'real').dataMode).toBe('real');
  });
});
