import { describe, expect, it } from 'vitest';
import {
  validateEmotionMapToolInput,
  validateEmotionMapToolOutput,
} from '../../supabase/functions/_shared/emotionMapMcpValidation';

describe('Emotion Map MCP strict validation', () => {
  it('rejects unknown fields, impossible dates and out-of-range limits', () => {
    expect(validateEmotionMapToolInput('search_emotion_records', {
      query: 'campus', extra: true,
    }).ok).toBe(false);
    expect(validateEmotionMapToolInput('get_day_emotion_context', {
      date: '2026-02-30',
    }).ok).toBe(false);
    expect(validateEmotionMapToolInput('search_emotion_records', {
      query: 'campus', limit: 21,
    }).ok).toBe(false);
  });

  it('normalizes a valid bounded research request', () => {
    expect(validateEmotionMapToolInput('research_emotion_context', {
      query: '  campus walk  ', limit: 6,
    })).toEqual({
      ok: true,
      value: { query: 'campus walk', limit: 6 },
    });
  });

  it('validates structured output against the selected tool contract', () => {
    expect(validateEmotionMapToolOutput('search_emotion_records', {
      status: 'not_found', count: 0, records: [], limitations: [],
    })).toBe(true);
    expect(validateEmotionMapToolOutput('search_emotion_records', {
      status: 'not_found', count: 1, records: [], limitations: [], extra: true,
    })).toBe(false);
  });
});
