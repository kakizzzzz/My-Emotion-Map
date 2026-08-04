import { describe, expect, it } from 'vitest';
import { reconcileFollowUpsForNote } from '../../src/app/noteEditorHandlers';
import type { EmotionNote, FollowUpRecord } from '../../src/types';

const note: EmotionNote = {
  id: 'note-cycle',
  title: '安静角落',
  titleSource: 'user',
  place: '图书馆',
  date: '2026-08-01',
  time: '10:00',
  emotion: 'calm',
  placeRating: 'comfortable',
  answers: [],
  excerpt: '测试记录',
  followUpEnabled: true,
};
const consentedAt = '2026-08-01T10:00:00.000Z';
const record = (
  intervalDays: number,
  status: FollowUpRecord['status'],
): FollowUpRecord => ({
  id: `follow-${intervalDays}-${status}`,
  noteId: note.id,
  intervalDays,
  dueAt: new Date(
    new Date(consentedAt).getTime() + intervalDays * 86_400_000,
  ).toISOString(),
  status,
  promptVersion: 2,
  followUpConsentedAt: consentedAt,
  ...(status === 'answered'
    ? {
        answeredAt: '2026-08-04T10:00:00.000Z',
        responseOptionId: 'lighter' as const,
        response: '轻了',
      }
    : {}),
});

describe('note follow-up reconciliation', () => {
  it('does not recreate an answered interval when an enabled note is saved again', () => {
    const result = reconcileFollowUpsForNote({
      records: [record(3, 'answered'), record(7, 'queued'), record(14, 'queued')],
      note,
      language: 'zh',
      intervals: [3, 7, 14],
      enabled: true,
      wasEnabled: true,
      now: new Date('2026-08-05T00:00:00.000Z'),
    });
    expect(result.filter((item) => item.intervalDays === 3)).toHaveLength(1);
    expect(result.filter((item) => item.status === 'queued')).toHaveLength(2);
  });

  it('does not restart a completed curve merely because the note is edited', () => {
    const result = reconcileFollowUpsForNote({
      records: [record(3, 'answered'), record(7, 'answered'), record(14, 'answered')],
      note,
      language: 'zh',
      intervals: [3, 7, 14],
      enabled: true,
      wasEnabled: true,
      now: new Date('2026-09-01T00:00:00.000Z'),
    });
    expect(result).toHaveLength(3);
    expect(result.every((item) => item.status === 'answered')).toBe(true);
  });

  it('starts a new consent cycle only after follow-up was turned off and on again', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const result = reconcileFollowUpsForNote({
      records: [record(3, 'answered'), record(7, 'answered'), record(14, 'answered')],
      note,
      language: 'zh',
      intervals: [3, 7, 14],
      enabled: true,
      wasEnabled: false,
      now,
    });
    const queued = result.filter((item) => item.status === 'queued');
    expect(queued.map((item) => item.intervalDays)).toEqual([3, 7, 14]);
    expect(queued.every((item) => item.followUpConsentedAt === now.toISOString())).toBe(true);
  });
});
