import { describe, expect, it } from 'vitest';
import { planChatSources } from '../../supabase/functions/_shared/sourcePlan';

describe('deterministic chat source plan', () => {
  it('keeps ordinary Emotion Map questions local', () => {
    expect(planChatSources('我昨天在地图里记录了什么')).toEqual({
      source: 'emotion_map_local',
      tools: [],
      maxCalls: 0,
    });
  });

  it('uses both sources only when My Life Memory is explicitly combined', () => {
    expect(planChatSources('结合 My Life Memory 看这周')).toEqual({
      source: 'both',
      tools: ['research_memory_context'],
      maxCalls: 1,
    });
  });

  it('allows route and image tools only for explicit requests', () => {
    expect(planChatSources('结合 My Life Memory 看我保存的路线')).toEqual({
      source: 'both',
      tools: ['get_routes'],
      maxCalls: 1,
    });
    expect(planChatSources('看看 My Life Memory 的照片', true)).toEqual({
      source: 'my_life_memory',
      tools: ['research_memory_context', 'get_memory_images'],
      maxCalls: 2,
    });
    expect(planChatSources('看看 My Life Memory 的照片', false)).toEqual({
      source: 'my_life_memory',
      tools: ['research_memory_context'],
      maxCalls: 1,
    });
  });

  it('does not route diagnostic requests to either memory source', () => {
    expect(planChatSources('分析我的人格并诊断我')).toEqual({
      source: 'unsupported',
      tools: [],
      maxCalls: 0,
    });
  });
});
