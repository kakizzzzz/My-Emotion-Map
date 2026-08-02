import { describe, expect, it } from 'vitest';
import { createDemoAppData } from '../../src/app/appDataRepository';
import {
  DEMO_SUGGESTED_PROMPTS,
  createDemoChatResponse,
} from '../../src/features/chat/demoChatResponder';

describe('deterministic Demo chat', () => {
  const demo = createDemoAppData(new Date('2026-08-02T12:00:00'));

  it('offers 6-10 prompts that cover lookup, comparison, and pattern', () => {
    expect(DEMO_SUGGESTED_PROMPTS.zh).toHaveLength(8);
    expect(new Set(DEMO_SUGGESTED_PROMPTS.zh.map((item) => item.intent))).toEqual(
      new Set(['lookup', 'comparison', 'pattern']),
    );
  });

  it.each([
    ['图书馆的记录是什么？', 'lookup'],
    ['上午和下午有什么不同？', 'comparison'],
    ['这些记录有什么重复现象？', 'pattern'],
  ] as const)('answers %s only from Demo note IDs', (question, intent) => {
    const result = createDemoChatResponse({
      message: question,
      language: 'zh',
      notes: demo.notes,
    });
    expect(result.intent).toBe(intent);
    expect(result.answer).toContain('演示回答');
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence.every((item) =>
      item.noteId.startsWith('demo:synthetic:campus-day:')
    )).toBe(true);
  });
});
