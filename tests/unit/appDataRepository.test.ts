import { beforeEach, describe, expect, it } from 'vitest';
import {
  APP_DATA_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  appendRevisitRecord,
  createDemoAppData,
  createEmptyAppData,
  dismissInboxItem,
  isValidCoordinate,
  isValidDate,
  loadAppData,
  migrateAppData,
  removeMomentAssociations,
} from '../../src/app/appDataRepository';
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
        revisitedEmotion: 'joy',
        originalOccurredAt: '2026-07-28T14:20:00.000Z',
        revisitedAt: '2026-07-29T14:20:00.000Z',
      },
    ],
  };
}

describe('app data repository', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts a fresh browser in clearly separated Demo data', () => {
    const loaded = loadAppData();

    expect(loaded.dataMode).toBe('demo');
    expect(loaded.moments.length).toBeGreaterThan(0);
    expect(loaded.notes.length).toBeGreaterThan(0);
  });

  it('migrates a legacy snapshot without changing the storage key', () => {
    const legacy = {
      moments: [moment],
      notes: [note],
      conversations: [],
      followUps: [],
      starInboxItems: [],
    };
    window.localStorage.setItem(APP_DATA_STORAGE_KEY, JSON.stringify(legacy));

    const loaded = loadAppData();

    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.dataMode).toBe('real');
    expect(loaded.moments).toHaveLength(1);
    expect(loaded.notes[0].title).toBe(note.title);
    expect(window.localStorage.getItem(APP_DATA_STORAGE_KEY)).not.toBeNull();
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

    const migrated = migrateAppData({
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
      migrateAppData(migrated.snapshot).snapshot,
    ).toEqual(migrated.snapshot);
  });

  it('recovers from damaged JSON to a visible-safe empty state', () => {
    window.localStorage.setItem(APP_DATA_STORAGE_KEY, '{broken');

    const loaded = loadAppData();

    expect(loaded.loadIssue).toBe('corrupt-json');
    expect(loaded.dataMode).toBe('real');
    expect(loaded.moments).toEqual([]);
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
    const migrated = migrateAppData({
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
    expect(demo.starInboxItems.length).toBeGreaterThan(0);
  });

  it('appends a revisit without mutating the original note emotion', () => {
    const revisits = appendRevisitRecord(
      [],
      note,
      'joy',
      undefined,
      '2026-07-29T14:20:00.000Z',
    );

    expect(note.emotion).toBe('calm');
    expect(revisits).toHaveLength(1);
    expect(revisits[0]).toMatchObject({
      originalEmotion: 'calm',
      revisitedEmotion: 'joy',
      revisitedAt: '2026-07-29T14:20:00.000Z',
    });
  });

  it('persists inbox dismissal as data state', () => {
    const items = createDemoAppData().starInboxItems;
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
    const next = removeMomentAssociations(populatedSnapshot(), moment.id);

    expect(next.moments).toEqual([]);
    expect(next.notes).toEqual([]);
    expect(next.revisits).toEqual([]);
    expect(next.followUps).toEqual([]);
    expect(next.conversations[0].messages[0].noteIds).toEqual([]);
  });
});
