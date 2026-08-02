import { describe, expect, it } from 'vitest';
import { researchEmotionContext } from '../../supabase/functions/_shared/emotionMapMcpResearch';

const snapshot = {
  dataMode: 'real',
  moments: [
    { noteId: 'n1', longitude: 127, latitude: 37 },
    { noteId: 'n2', longitude: 127, latitude: 37 },
    { noteId: 'n3', longitude: 127, latitude: 37 },
    { noteId: 'draft', isNew: true, longitude: 127, latitude: 37 },
  ],
  notes: [
    { id: 'n1', title: '校园散步', place: '东国大学', date: '2026-08-01', time: '10:00', emotion: 'calm', excerpt: '' },
    { id: 'n2', title: '校园午饭', place: '东国大学', date: '2026-08-02', time: '12:00', emotion: 'joy', excerpt: '' },
    { id: 'n3', title: '图书馆', place: '中央图书馆', date: '2026-08-03', time: '14:00', emotion: null, excerpt: '' },
    { id: 'draft', title: '未完成', place: '东国大学', date: '2026-08-04', isDraft: true },
  ],
};

describe('Emotion Map MCP research computation', () => {
  it('returns privacy-safe ambiguity options without guessing', async () => {
    const result = await researchEmotionContext({
      snapshot,
      userId: 'user-a',
      query: '东国大学',
      limit: 6,
      continuationSecret: 'test-secret-at-least-32-characters-long',
      now: new Date('2026-08-02T00:00:00.000Z'),
    });
    expect(result.retrievalStatus).toBe('ambiguous');
    expect(result.options).toHaveLength(2);
    expect(JSON.stringify(result.options)).not.toContain('noteId');
    expect(result.continuationToken).toMatch(/^emc1\./);
    expect(result.aggregates).toMatchObject({
      totalAuthorized: 3,
      totalMatching: 2,
    });
  });

  it('returns an explicit zero result without fabrication', async () => {
    const result = await researchEmotionContext({
      snapshot,
      userId: 'user-a',
      query: '不存在的海边',
      limit: 6,
      continuationSecret: 'test-secret-at-least-32-characters-long',
      now: new Date('2026-08-02T00:00:00.000Z'),
    });
    expect(result).toMatchObject({
      retrievalStatus: 'not_found',
      records: [],
      aggregates: { totalAuthorized: 3, totalMatching: 0 },
    });
  });

  it('fails closed when ambiguity signing is not configured', async () => {
    const result = await researchEmotionContext({
      snapshot, userId: 'user-a', query: '东国大学', limit: 6,
      continuationSecret: '',
      now: new Date('2026-08-02T00:00:00.000Z'),
    });
    expect(result).toMatchObject({
      status: 'evidence_insufficient',
      retrievalStatus: 'evidence_insufficient',
      options: [],
      continuationToken: null,
      limitations: ['continuation_unavailable'],
    });
  });
});
