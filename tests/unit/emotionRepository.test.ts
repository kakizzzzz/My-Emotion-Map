import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyEmotionChanges,
  applyEmotionMutations,
  loadEmotionChangesSince,
  loadNormalizedEmotionAccountData,
} from '../../src/services/normalizedSync/emotionRepository';
import type {
  EmotionMutation,
  NormalizedEmotionSnapshot,
} from '../../src/services/normalizedSync/emotionSyncTypes';

type Row = Record<string, unknown>;
type RangeCall = { table: string; from: number; to: number };

const settingsRow = (revision: number, overrides: Row = {}): Row => ({
  user_id: 'user-a',
  dataset_revision: revision,
  changed_revision: revision,
  data_model_version: 2,
  migration_verified_at: '2026-08-04T00:00:00.000Z',
  migration_verification: { verified: true },
  theme_tone: 'original',
  ...overrides,
});

const preferencesRow = (revision = 1): Row => ({
  user_id: 'user-a',
  changed_revision: revision,
  deleted_at: null,
  avatar_data_url: 'data:image/webp;base64,YXZhdGFy',
  profile_name: 'Kaki',
  language: 'ko',
  about_me: '',
  ai_user_prompt: '',
  ai_context_message_count: 8,
  chat_preference_tags: [],
  follow_up_intervals: [3, 7, 14],
});

const recordRow = (
  index: number,
  overrides: Row = {},
): Row => ({
  user_id: 'user-a',
  moment_id: `moment-${index.toString().padStart(4, '0')}`,
  note_id: `note-${index.toString().padStart(4, '0')}`,
  sort_order: index,
  longitude: 121.544,
  latitude: 29.8683,
  place: `Place ${index}`,
  emotion: null,
  intensity: 0,
  place_rating: null,
  color: '#f4c95d',
  local_date: '2026-08-04',
  local_time: '12:00',
  time_precision: 'minute',
  event_time_source: 'manual',
  title: `Record ${index}`,
  answers: [],
  excerpt: '',
  is_draft: false,
  is_new: false,
  follow_up_enabled: false,
  changed_revision: 1,
  deleted_at: null,
  ...overrides,
});

const fakeClient = ({
  settingsReads,
  tables = {},
  rpc = vi.fn(),
}: {
  settingsReads: Row[];
  tables?: Record<string, Row[]>;
  rpc?: ReturnType<typeof vi.fn>;
}) => {
  const reads = [...settingsReads];
  const rangeCalls: RangeCall[] = [];
  const from = vi.fn((table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    const orders: string[] = [];
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      gt: (column: string, value: number) => {
        filters.push((row) => Number(row[column]) > value);
        return query;
      },
      lte: (column: string, value: number) => {
        filters.push((row) => Number(row[column]) <= value);
        return query;
      },
      order: (column: string) => {
        orders.push(column);
        return query;
      },
      range: async (start: number, end: number) => {
        rangeCalls.push({ table, from: start, to: end });
        const rows = [...(tables[table] ?? [])]
          .filter((row) => filters.every((filter) => filter(row)))
          .sort((left, right) => {
            for (const column of orders) {
              const comparison = String(left[column] ?? '')
                .localeCompare(String(right[column] ?? ''), undefined, {
                  numeric: true,
                });
              if (comparison) return comparison;
            }
            return 0;
          });
        return { data: rows.slice(start, end + 1), error: null };
      },
      maybeSingle: async () => {
        if (table === 'emotion_settings') {
          return { data: reads.shift() ?? settingsReads.at(-1) ?? null, error: null };
        }
        const row = (tables[table] ?? []).find((value) =>
          filters.every((filter) => filter(value)),
        ) ?? null;
        return { data: row, error: null };
      },
    };
    return query;
  });
  return {
    client: { from, rpc } as unknown as SupabaseClient,
    rangeCalls,
    rpc,
  };
};

const emptySnapshot = (): NormalizedEmotionSnapshot => ({
  settings: { schemaVersion: 6, themeTone: 'original', themePalette: {
    background: '#f6f6f2', panel: '#e6e6df', card: '#ffffff',
    accent: '#666666', text: '#1d1d1f', muted: '#858585',
  } },
  preferences: {
    avatarSrc: '', profileName: '', language: 'zh', aboutMe: '',
    aiUserPrompt: '', aiContextMessageCount: 8,
    chatPreferenceTags: [], followUpIntervals: [3, 7, 14],
  },
  records: [], conversations: [], messages: [], followUps: [], revisits: [],
});

describe('normalized emotion repository', () => {
  it('reads more than 1000 records in stable 500-row pages', async () => {
    const records = Array.from({ length: 1_001 }, (_, index) => recordRow(index));
    const { client, rangeCalls } = fakeClient({
      settingsReads: [settingsRow(4), settingsRow(4)],
      tables: { emotion_preferences: [preferencesRow(4)], emotion_records: records },
    });

    const loaded = await loadNormalizedEmotionAccountData(client, 'user-a');

    expect(loaded.revision).toBe(4);
    expect(loaded.snapshot.preferences).toMatchObject({
      avatarSrc: 'data:image/webp;base64,YXZhdGFy',
      profileName: 'Kaki',
      language: 'ko',
    });
    expect(loaded.snapshot.records).toHaveLength(1_001);
    expect(loaded.snapshot.records.at(-1)?.momentId).toBe('moment-1000');
    expect(rangeCalls.filter((call) => call.table === 'emotion_records')).toEqual([
      { table: 'emotion_records', from: 0, to: 499 },
      { table: 'emotion_records', from: 500, to: 999 },
      { table: 'emotion_records', from: 1_000, to: 1_499 },
    ]);
  });

  it('rejects a full read after three changing revision sandwiches', async () => {
    const { client } = fakeClient({
      settingsReads: [
        settingsRow(1), settingsRow(2),
        settingsRow(2), settingsRow(3),
        settingsRow(3), settingsRow(4),
      ],
      tables: { emotion_preferences: [preferencesRow()] },
    });

    await expect(loadNormalizedEmotionAccountData(client, 'user-a')).rejects
      .toMatchObject({ kind: 'inconsistent_read' });
  });

  it('loads remote tombstones and prevents deleted records from resurrecting', async () => {
    const deleted = recordRow(1, {
      changed_revision: 2,
      deleted_at: '2026-08-04T01:00:00.000Z',
    });
    const { client } = fakeClient({
      settingsReads: [settingsRow(2), settingsRow(2)],
      tables: {
        emotion_preferences: [],
        emotion_records: [deleted],
      },
    });
    const source = emptySnapshot();
    source.records = [{
      momentId: 'moment-0001', noteId: 'note-0001', sortOrder: 1,
      longitude: 121.544, latitude: 29.8683, place: 'Old', emotion: null,
      intensity: 0, placeRating: null, color: '#f4c95d', tagGroupId: null,
      tagOrder: null, localDate: '2026-08-04', localTime: '12:00',
      occurredAtUtc: null, timeZone: null, utcOffsetMinutes: null,
      timePrecision: 'minute', eventTimeSource: 'manual', source: 'manual',
      photoTakenAt: null, photoTakenAtKind: null, photoTakenAtSource: null,
      importedAt: null, locationCapturedAt: null, locationTimeRelation: null,
      title: 'Old', titleSource: null, answers: [], excerpt: '', isDraft: false,
      isNew: false, followUpEnabled: false,
    }];

    const changes = await loadEmotionChangesSince(client, 'user-a', 1);
    const merged = applyEmotionChanges(source, changes);

    expect(changes.records[0]).toMatchObject({
      changedRevision: 2,
      deletedAt: '2026-08-04T01:00:00.000Z',
    });
    expect(merged.records).toEqual([]);
  });

  it('sends exact wire mutations and rejects batches larger than 500', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ saved: true, dataset_revision: 8, conflict: null }],
      error: null,
    });
    const { client } = fakeClient({ settingsReads: [], rpc });
    const mutation: EmotionMutation = {
      mutationId: 'local-only-id',
      type: 'record_soft_delete',
      entityId: 'moment-1',
      base: { momentId: 'moment-1' },
      createdAt: 1,
    };

    await expect(applyEmotionMutations(client, 7, [mutation])).resolves.toEqual({
      saved: true, revision: 8, conflict: null,
    });
    expect(rpc).toHaveBeenCalledWith('apply_emotion_mutations', {
      p_expected_revision: 7,
      p_mutations: [{ type: 'record_soft_delete', entityId: 'moment-1' }],
    });

    const tooMany = Array.from({ length: 501 }, (_, index) => ({
      ...mutation,
      mutationId: `mutation-${index}`,
      entityId: `moment-${index}`,
    }));
    await expect(applyEmotionMutations(client, 8, tooMany)).rejects
      .toMatchObject({ kind: 'validation' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
