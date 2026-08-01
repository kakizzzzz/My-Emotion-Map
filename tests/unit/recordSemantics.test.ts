import { describe, expect, it } from 'vitest';
import { createRecord } from '../../src/app/recordFactory';
import { createRecordId } from '../../src/app/createRecordId';
import { applyAiOptionalQuestions, PURPOSE_QUESTION } from '../../src/domain/notePrompts';
import { parseExifWallTime } from '../../src/features/map/photoMetadata';

describe('record creation and photo time semantics', () => {
  it.each(['manual', 'current-location', 'photo', 'inbox'] as const)(
    'creates %s records without hidden emotion defaults',
    (source) => {
      const { moment, note } = createRecord({
        longitude: 126.95,
        latitude: 37.55,
        place: 'Library',
        language: 'en',
        source,
      });

      expect(moment).toMatchObject({
        emotion: null,
        placeRating: null,
        intensity: 0,
        source,
      });
      expect(note.emotion).toBeNull();
      expect(note.placeRating).toBeNull();
      expect(note.answers[0]).toMatchObject({
        question: PURPOSE_QUESTION.en,
        role: 'purpose',
      });
      expect(note.answers).toHaveLength(3);
    },
  );

  it('keeps EXIF wall time independent from the device timezone', () => {
    expect(parseExifWallTime('2026:01:02 23:58:59')).toEqual({
      localIso: '2026-01-02T23:58:59',
      date: '2026-01-02',
      time: '23:58',
    });
    expect(parseExifWallTime('2026:02:30 12:00:00')).toBeNull();
  });

  it('uses cryptographically backed record IDs when the platform provides them', () => {
    expect(createRecordId('moment')).toMatch(/^moment-[a-zA-Z0-9-]+$/);
  });

  it('keeps the frontend-owned purpose prompt and accepts at most two AI questions', () => {
    const { note } = createRecord({ longitude: 0, latitude: 0, place: '', language: 'zh', source: 'photo' });
    const next = applyAiOptionalQuestions(note.answers, ['可选一', '可选二', '可选三'], 'zh');
    expect(next).toHaveLength(3);
    expect(next[0]).toMatchObject({ question: PURPOSE_QUESTION.zh, role: 'purpose' });
    expect(next.slice(1).map((item) => item.role)).toEqual(['ai', 'ai']);
  });
});
