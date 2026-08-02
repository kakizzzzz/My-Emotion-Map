import { describe, expect, it } from 'vitest';
import {
  setRevisitCurrentEmotion,
  upsertFollowUpRevisit,
} from '../../src/app/recordAssociations';
import type { EmotionNote } from '../../src/types';

const note: EmotionNote = {
  id: 'note-1', title: '记录', place: '校园', date: '2026-08-01', time: '12:00',
  emotion: 'calm', placeRating: null, answers: [], excerpt: '',
};

describe('follow-up revisit direction', () => {
  it('upserts exactly one revisit for a non-skip follow-up', () => {
    const once = upsertFollowUpRevisit([], note, 'follow-up-1', 'lighter',
      '2026-08-02T12:00:00.000Z');
    const twice = upsertFollowUpRevisit(once, note, 'follow-up-1', 'same',
      '2026-08-02T12:01:00.000Z');
    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({
      sourceFollowUpId: 'follow-up-1', changeDirection: 'same',
      originalEmotion: 'calm',
    });
  });

  it('fills currentEmotion without changing the revisit id', () => {
    const created = upsertFollowUpRevisit([], note, 'follow-up-1', 'different');
    const updated = setRevisitCurrentEmotion(
      created, note, 'follow-up-1', 'joy', 'different',
    );
    expect(updated[0].id).toBe(created[0].id);
    expect(updated[0].currentEmotion).toBe('joy');
    expect(note.emotion).toBe('calm');
  });

  it('preserves the trusted original instant for cross-zone revisits', () => {
    const [record] = upsertFollowUpRevisit(
      [],
      {
        ...note,
        occurredAtUtc: '2026-08-01T03:00:00.000Z',
        localDate: '2026-08-01',
        localTime: '12:00',
      },
      'follow-up-zone',
      'same',
    );
    expect(record.originalOccurredAt).toBe('2026-08-01T03:00:00.000Z');
  });
});
