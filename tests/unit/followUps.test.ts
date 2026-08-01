import { describe, expect, it } from 'vitest';
import {
  getFollowUpOptions,
  promoteNextDueFollowUp,
} from '../../src/domain/followUps';
import type { FollowUpRecord } from '../../src/types';

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
  it.each(['zh', 'en', 'ko'] as const)(
    'offers an explicit positive response in %s',
    (language) => {
      expect(getFollowUpOptions(language)[0]).toMatchObject({
        id: 'positive',
        responseKind: 'positive',
      });
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
