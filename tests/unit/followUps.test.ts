import { describe, expect, it } from 'vitest';
import {
  createFollowUpForNote,
  getFollowUpOptions,
  normalizeFollowUpCurve,
  promoteNextDueFollowUp,
} from '../../src/domain/followUps';
import type { EmotionNote, FollowUpRecord } from '../../src/types';

const records: FollowUpRecord[] = [
  {
    id: 'later',
    noteId: 'note-2',
    intervalDays: 7,
    dueAt: '2026-08-04T00:00:00.000Z',
    status: 'queued',
    prompt: 'Later',
  },
  {
    id: 'due-first',
    noteId: 'note-1',
    intervalDays: 1,
    dueAt: '2026-07-27T00:00:00.000Z',
    status: 'queued',
    prompt: 'First',
  },
  {
    id: 'due-second',
    noteId: 'note-3',
    intervalDays: 3,
    dueAt: '2026-07-28T00:00:00.000Z',
    status: 'queued',
    prompt: 'Second',
  },
];

describe('follow-up promotion', () => {
  it('starts with three follow-up times and lets users add more', () => {
    expect(normalizeFollowUpCurve(undefined)).toEqual([3, 7, 14]);
  });

  it('keeps a user-defined ordered curve within the supported bounds', () => {
    expect(normalizeFollowUpCurve([30, 3, 7, 7, 0, 366])).toEqual([
      3, 7, 30,
    ]);
  });

  it('schedules a follow-up at a custom day instead of a fixed preset', () => {
    const note = { id: 'note-custom' } as EmotionNote;
    const record = createFollowUpForNote(
      note,
      'zh',
      14,
      new Date('2026-08-01T00:00:00.000Z'),
    );

    expect(record.intervalDays).toBe(14);
    expect(record.dueAt).toBe('2026-08-15T00:00:00.000Z');
  });

  it.each(['zh', 'en', 'ko'] as const)(
    'returns exactly the five canonical options in %s',
    (language) => {
      const options = getFollowUpOptions(language);
      expect(options.map((option) => option.id)).toEqual([
        'lighter', 'stronger', 'different', 'same', 'skip',
      ]);
      expect(options.map((option) => option.responseKind)).toEqual(
        options.map((option) => option.id),
      );
    },
  );

  it('activates only records whose dueAt is not in the future', () => {
    const next = promoteNextDueFollowUp(
      records,
      new Date('2026-07-28T12:00:00.000Z'),
    );

    expect(next.find((item) => item.id === 'due-first')?.status).toBe(
      'active',
    );
    expect(next.find((item) => item.id === 'later')?.status).toBe('queued');
  });

  it('keeps at most one active follow-up', () => {
    const next = promoteNextDueFollowUp(
      records.map((record) => ({
        ...record,
        status:
          record.id === 'later' ? 'queued' : ('active' as const),
      })),
      new Date('2026-07-28T12:00:00.000Z'),
    );

    expect(next.filter((item) => item.status === 'active')).toHaveLength(1);
    expect(next.find((item) => item.id === 'due-first')?.status).toBe(
      'active',
    );
  });
});
