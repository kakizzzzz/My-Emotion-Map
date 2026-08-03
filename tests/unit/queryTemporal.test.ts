import { describe, expect, it } from 'vitest';
import { routeQueryIntent } from '../../src/domain/query/routeIntent';
import { parseQueryConstraints } from '../../src/domain/query/parseConstraints';
import {
  createLocalSearchIndex,
  rankLocalRecords,
  rankLocalSearch,
} from '../../src/domain/query/rankRecords';
import { resolveRetrievalStatus } from '../../src/domain/query/retrievalStatus';
import { createTemporalFields, migrateLegacyTemporalFields } from '../../src/domain/time/temporal';
import type { EmotionMoment, EmotionNote } from '../../src/types';
import {
  normalized as normalizeEdgeQuery,
  parseChatQueryConstraints,
  routeIntent as routeEdgeIntent,
} from '../../supabase/functions/_shared/chatGrounding';
import { normalizeQueryText } from '../../src/domain/query/normalizeQuery';

describe('v4 query and temporal contracts', () => {
  it.each([
    ['查找 2026-08-01 的记录', 'lookup'],
    ['比较图书馆和食堂', 'comparison'],
    ['哪些地方经常出现', 'pattern'],
    ['现在回看这条记录', 'reflection'],
    ['你好', 'clarification_required'],
    ['最近记录', 'recent_records'],
    ['一共有多少条记录', 'count_stats'],
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

  it('rejects impossible calendar dates instead of string-matching them', () => {
    expect(parseQueryConstraints('查找 2026-02-31 的记录')).toMatchObject({
      exactDate: null,
      dateRange: null,
      invalidDate: true,
    });
    expect(routeQueryIntent('查找 2026-02-31 的记录')).toBe(
      'clarification_required',
    );
  });

  it('keeps client and Edge query parsing on the same three-language corpus', () => {
    const now = new Date(2026, 7, 5, 12);
    for (const query of [
      '圖書館 8月3日',
      'last 7 days',
      '최근 기록',
      '2026-02-31',
      '一共有多少条记录',
    ]) {
      expect(normalizeEdgeQuery(query)).toBe(normalizeQueryText(query));
      expect(parseChatQueryConstraints(query, now)).toEqual(
        parseQueryConstraints(query, now),
      );
      expect(routeEdgeIntent(query)).toBe(routeQueryIntent(query));
    }
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

  it('preserves an explicit photo offset independently of the device zone', () => {
    expect(createTemporalFields({
      localDate: '2026-08-02',
      localTime: '09:15',
      source: 'photo-exif',
      sourceTimestamp: '2026-08-02T09:15:00+09:00',
      timeZone: 'Asia/Shanghai',
    })).toMatchObject({
      occurredAtUtc: '2026-08-02T00:15:00.000Z',
      localDate: '2026-08-02',
      localTime: '09:15',
      utcOffsetMinutes: 540,
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

  it('does not treat close multi-record pattern scores as single-record ambiguity', () => {
    expect(resolveRetrievalStatus({
      intent: 'pattern',
      scores: [20, 19, 18],
      dateCount: 3,
    })).toBe('supported');
    expect(resolveRetrievalStatus({
      intent: 'lookup',
      scores: [20, 19],
      dateCount: 2,
    })).toBe('ambiguous');
  });

  it('indexes user answers but never the translated system question', () => {
    const baseNote: EmotionNote = {
      id: 'answer-note', title: '窗边', place: '校园', date: '2026-08-01',
      time: '10:00', emotion: null, placeRating: null, excerpt: '',
      answers: [{ id: 'a1', question: '以后想提醒自己什么', answer: '带一本小说' }],
    };
    const moment: EmotionMoment = {
      id: 'answer-moment', noteId: baseNote.id, emotion: null, intensity: 0,
      place: '校园', date: '2026-08-01', time: '10:00', latitude: 37,
      longitude: 127, placeRating: null,
    };
    expect(rankLocalRecords('提醒自己', [moment], [baseNote])).toEqual([]);
    expect(rankLocalRecords('帶一本小說', [moment], [baseNote])).toHaveLength(1);
  });

  it('keeps a 5000-record local search within the interaction budget', () => {
    const notes: EmotionNote[] = [];
    const moments: EmotionMoment[] = [];
    for (let index = 0; index < 5_000; index += 1) {
      const noteId = `note-${index}`;
      notes.push({
        id: noteId,
        title: index === 4_999 ? '圖書館窗邊' : `校园记录 ${index}`,
        place: '东国大学',
        date: '2026-08-01',
        time: '10:00',
        emotion: null,
        placeRating: null,
        excerpt: '',
        answers: [],
      });
      moments.push({
        id: `moment-${index}`, noteId, emotion: null, intensity: 0,
        place: '东国大学', date: '2026-08-01', time: '10:00',
        latitude: 37, longitude: 127, placeRating: null,
      });
    }
    const index = createLocalSearchIndex(moments, notes);
    const durations = Array.from({ length: 20 }, () => {
      const start = performance.now();
      expect(rankLocalSearch('图书馆窗边', index)[0]?.moment.noteId)
        .toBe('note-4999');
      return performance.now() - start;
    }).sort((left, right) => left - right);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(50);
  });
});
