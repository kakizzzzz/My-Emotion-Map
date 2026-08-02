import { describe, expect, it } from 'vitest';
import { routeQueryIntent } from '../../src/domain/query/routeIntent';
import { parseQueryConstraints } from '../../src/domain/query/parseConstraints';
import { rankLocalRecords } from '../../src/domain/query/rankRecords';
import { resolveRetrievalStatus } from '../../src/domain/query/retrievalStatus';
import { createTemporalFields, migrateLegacyTemporalFields } from '../../src/domain/time/temporal';
import type { EmotionMoment, EmotionNote } from '../../src/types';

describe('v4 query and temporal contracts', () => {
  it.each([
    ['查找 2026-08-01 的记录', 'lookup'],
    ['比较图书馆和食堂', 'comparison'],
    ['哪些地方经常出现', 'pattern'],
    ['现在回看这条记录', 'reflection'],
    ['你好', 'reflection'],
    ['诊断我的人格', 'unsupported'],
  ] as const)('routes %s as %s', (query, intent) => {
    expect(routeQueryIntent(query)).toBe(intent);
  });

  it('parses multilingual relative dates without UTC conversion', () => {
    const now = new Date(2026, 7, 5, 12);
    expect(parseQueryConstraints('前天', now).exactDate).toBe('2026-08-03');
    expect(parseQueryConstraints('last 7 days', now).dateRange).toEqual({
      start: '2026-07-30', end: '2026-08-05',
    });
    expect(parseQueryConstraints('8月6日', now).exactDate).toBe('2025-08-06');
  });

  it('keeps no-offset photo EXIF as wall time with unknown zone', () => {
    expect(createTemporalFields({
      localDate: '2026-11-01',
      localTime: '01:30',
      source: 'photo-exif',
      sourceTimestamp: '2026-11-01T01:30:00',
      timeZone: 'America/New_York',
    })).toMatchObject({
      occurredAtUtc: null,
      localDate: '2026-11-01',
      localTime: '01:30',
      timeZone: null,
      utcOffsetMinutes: null,
    });
  });

  it('does not invent timezone fields when migrating legacy time', () => {
    expect(migrateLegacyTemporalFields({
      date: '2026-03-08', time: '02:30', eventTimeSource: 'legacy',
    })).toMatchObject({ occurredAtUtc: null, timeZone: null, utcOffsetMinutes: null });
  });

  it('never returns recent records for a query with no matching term', () => {
    const note: EmotionNote = {
      id: 'n1', title: '图书馆', place: '校园', date: '2026-08-01', time: '10:00',
      emotion: null, placeRating: null, answers: [], excerpt: '',
    };
    const moment: EmotionMoment = {
      id: 'm1', noteId: 'n1', emotion: null, intensity: 0, place: '校园',
      date: '2026-08-01', time: '10:00', latitude: 37, longitude: 127,
      placeRating: null,
    };
    expect(rankLocalRecords('完全不相关', [moment], [note])).toEqual([]);
  });

  it('separates ambiguous and insufficient retrieval states', () => {
    expect(resolveRetrievalStatus({ intent: 'lookup', scores: [20, 14], dateCount: 2 })).toBe('ambiguous');
    expect(resolveRetrievalStatus({ intent: 'comparison', scores: [20], dateCount: 1 })).toBe('evidence_insufficient');
    expect(resolveRetrievalStatus({ intent: 'pattern', scores: [30, 20, 10], dateCount: 3 })).toBe('supported');
  });
});
