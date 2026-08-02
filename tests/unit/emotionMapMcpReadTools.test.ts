import { describe, expect, it } from 'vitest';
import { executeEmotionMapReadTool } from '../../supabase/functions/_shared/emotionMapMcpReadTools';
import { validateEmotionMapToolOutput } from '../../supabase/functions/_shared/emotionMapMcpValidation';

const snapshot = {
  dataMode: 'real',
  moments: [
    { noteId: 'n1' }, { noteId: 'n2' }, { noteId: 'n3' },
  ],
  notes: [
    { id: 'n1', title: 'Campus walk', place: 'Dongguk University', date: '2026-08-01', time: '10:00', emotion: 'calm', excerpt: 'trees' },
    { id: 'n2', title: 'Campus lunch', place: 'Dongguk University', date: '2026-08-02', time: '12:00', emotion: 'joy', excerpt: 'meal' },
    { id: 'n3', title: 'Library', place: 'Central Library', date: '2026-08-03', time: '14:00', emotion: null, excerpt: 'study' },
  ],
};

const token = {
  id: 'token-a', userId: 'user-a', kind: 'output' as const,
  scopes: ['records:read'],
};

const cases = [
  ['research_emotion_context', { query: 'Campus', limit: 6 }],
  ['search_emotion_records', { query: 'Campus', limit: 20 }],
  ['list_emotion_locations', { limit: 50 }],
  ['get_location_emotion_context', { place: 'Dongguk University', limit: 20 }],
  ['get_day_emotion_context', { date: '2026-08-01', limit: 20 }],
  ['summarize_emotion_range', { startDate: '2026-08-01', endDate: '2026-08-03', groupBy: 'place' }],
  ['export_emotion_report', { startDate: '2026-08-01', endDate: '2026-08-03', format: 'json', limit: 50 }],
] as const;

describe('Emotion Map read tool outputs', () => {
  it('keeps all seven structured outputs inside their public schemas', async () => {
    for (const [name, input] of cases) {
      const output = await executeEmotionMapReadTool({
        token, snapshot, name, input,
        continuationSecret: 'test-secret-at-least-32-characters-long',
        now: new Date('2026-08-03T00:00:00.000Z'),
      });
      expect(validateEmotionMapToolOutput(name, output), name).toBe(true);
    }
  });

  it('computes range totals from the complete authorized set', async () => {
    const output = await executeEmotionMapReadTool({
      token, snapshot, name: 'summarize_emotion_range',
      input: { startDate: '2026-08-01', endDate: '2026-08-03', groupBy: 'place' },
      continuationSecret: 'test-secret-at-least-32-characters-long',
    });
    expect(output).toMatchObject({
      status: 'supported', count: 3,
      groups: expect.arrayContaining([
        { key: 'Dongguk University', count: 2 },
        { key: 'Central Library', count: 1 },
      ]),
    });
  });

  it('fails closed instead of parsing an unknown future snapshot schema', async () => {
    await expect(executeEmotionMapReadTool({
      token,
      snapshot: { ...snapshot, schemaVersion: 999 },
      name: 'search_emotion_records',
      input: { query: 'Campus' },
      continuationSecret: 'test-secret-at-least-32-characters-long',
    })).resolves.toBeNull();
  });
});
