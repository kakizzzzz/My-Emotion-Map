import { describe, expect, it } from 'vitest';
import {
  parseAiSourcePlan,
  planChatSources,
} from '../../supabase/functions/_shared/sourcePlan';
import { contextualizeMcpRequest } from '../../src/domain/query/mcpIntent';

describe('deterministic chat source plan', () => {
  it('accepts only bounded AI tool plans from the read-only whitelist', () => {
    expect(parseAiSourcePlan({
      source: 'both',
      tools: ['research_memory_context', 'get_memory_images'],
      maxCalls: 2,
      searchQuery: '校园照片',
    })).toEqual({
      source: 'both',
      tools: ['research_memory_context', 'get_memory_images'],
      maxCalls: 2,
      searchQuery: '校园照片',
    });
    expect(parseAiSourcePlan({
      source: 'both', tools: ['delete_memory'], maxCalls: 1, searchQuery: '旅行',
    })).toBeNull();
    expect(parseAiSourcePlan({
      source: 'both', tools: ['get_location_memory'], maxCalls: 1,
      searchQuery: '某个地点',
    })).toBeNull();
    expect(parseAiSourcePlan({
      source: 'both',
      tools: ['list_locations', 'get_location_memory'],
      maxCalls: 2,
      searchQuery: '最近游玩的地点',
    })).toEqual({
      source: 'both',
      tools: ['list_locations', 'get_location_memory'],
      maxCalls: 2,
      searchQuery: '最近游玩的地点',
    });
    expect(parseAiSourcePlan({
      source: 'both',
      tools: ['research_memory_context', 'get_location_memory'],
      maxCalls: 2,
      searchQuery: '最近游玩的地点',
    })).toBeNull();
    expect(parseAiSourcePlan({
      source: 'emotion_map_local', tools: ['research_memory_context'], maxCalls: 1,
    })).toBeNull();
    expect(parseAiSourcePlan({
      source: 'both', tools: ['research_memory_context'], maxCalls: 2,
      searchQuery: '旅行',
    })).toBeNull();
    expect(parseAiSourcePlan({
      source: 'both', tools: ['research_memory_context'], maxCalls: 1,
    })).toEqual({
      source: 'both', tools: ['research_memory_context'], maxCalls: 1,
    });
  });

  it('keeps ordinary Emotion Map questions local', () => {
    expect(planChatSources('我昨天在地图里记录了什么')).toEqual({
      source: 'emotion_map_local',
      tools: [],
      maxCalls: 0,
    });
    expect(planChatSources('今天拍了一张照片')).toEqual({
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

  it('routes explicit MCP calls and natural archive lookups to memory', () => {
    expect(planChatSources('你调用mcp看看')).toEqual({
      source: 'my_life_memory',
      tools: ['research_memory_context'],
      maxCalls: 1,
    });
    expect(planChatSources('我之前去过日本你能看到吗')).toEqual({
      source: 'both',
      tools: ['research_memory_context'],
      maxCalls: 1,
    });
    expect(planChatSources('你好，你去看看我去日本的经历')).toEqual({
      source: 'both',
      tools: ['research_memory_context'],
      maxCalls: 1,
    });
  });

  it('carries the previous user question into a bare MCP follow-up', () => {
    expect(contextualizeMcpRequest('你调用mcp看看', [
      { role: 'user', body: '我之前去过日本你能看到吗' },
      { role: 'assistant', body: '请告诉我更多信息。' },
    ])).toBe('我之前去过日本你能看到吗\nMy Life Memory');
    expect(contextualizeMcpRequest('用 MCP 查我在日本的记录', []))
      .toBe('用 MCP 查我在日本的记录');
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
