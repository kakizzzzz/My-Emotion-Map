import { detectMyLifeMemoryMcpIntent } from '../../../src/domain/query/mcpIntent.ts';

export type ChatSource =
  | 'emotion_map_local'
  | 'my_life_memory'
  | 'both'
  | 'unsupported';

export type MlmReadTool =
  | 'research_memory_context'
  | 'search_memories'
  | 'list_locations'
  | 'get_location_memory'
  | 'get_day_memory'
  | 'summarize_memory_range'
  | 'get_memory_images'
  | 'get_routes';

export type SourcePlan = {
  source: ChatSource;
  tools: MlmReadTool[];
  maxCalls: 0 | 1 | 2;
  searchQuery?: string;
  resultMode?: 'recent_places';
};

const mlmReadTools = new Set<MlmReadTool>([
  'research_memory_context',
  'search_memories',
  'list_locations',
  'get_location_memory',
  'get_day_memory',
  'summarize_memory_range',
  'get_memory_images',
  'get_routes',
]);
const modelPlannableTools = new Set<MlmReadTool>([
  'research_memory_context',
  'search_memories',
  'list_locations',
  'get_location_memory',
  'get_day_memory',
  'summarize_memory_range',
  'get_memory_images',
  'get_routes',
]);

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export const parseAiSourcePlan = (value: unknown): SourcePlan | null => {
  const body = asObject(value);
  if (!body || Object.keys(body).some((key) =>
    key !== 'source' && key !== 'tools' && key !== 'maxCalls' &&
    key !== 'searchQuery' && key !== 'resultMode')) return null;
  if (
    body.source !== 'emotion_map_local' &&
    body.source !== 'my_life_memory' &&
    body.source !== 'both' &&
    body.source !== 'unsupported'
  ) return null;
  if (!Array.isArray(body.tools) || body.tools.length > 2 ||
    body.tools.some((tool) => typeof tool !== 'string' ||
      !mlmReadTools.has(tool as MlmReadTool) ||
      !modelPlannableTools.has(tool as MlmReadTool))) return null;
  const tools = [...new Set(body.tools)] as MlmReadTool[];
  if (tools.length !== body.tools.length ||
    (body.maxCalls !== 0 && body.maxCalls !== 1 && body.maxCalls !== 2) ||
    body.maxCalls !== tools.length) return null;
  const external = body.source === 'my_life_memory' || body.source === 'both';
  if (external !== (tools.length > 0)) return null;
  if (tools.includes('get_location_memory') &&
    (tools.length !== 2 || tools[0] !== 'list_locations' ||
      tools[1] !== 'get_location_memory')) return null;
  const resultMode = body.resultMode === undefined
    ? undefined
    : body.resultMode === 'recent_places' ? body.resultMode : null;
  if (resultMode === null || (!external && resultMode) ||
    (resultMode === 'recent_places' &&
      (tools.length !== 1 || tools[0] !== 'search_memories'))) return null;
  const searchQuery = typeof body.searchQuery === 'string'
    ? body.searchQuery.normalize('NFKC').replace(/\s+/g, ' ').trim()
    : '';
  if ((external && searchQuery.length > 120) ||
    (!external && body.searchQuery !== undefined)) return null;
  return {
    source: body.source,
    tools,
    maxCalls: body.maxCalls,
    ...(searchQuery ? { searchQuery } : {}),
    ...(resultMode ? { resultMode } : {}),
  };
};

const unsupportedIntent = /诊断|抑郁症|焦虑症|人格|潜意识|自尊|依恋|diagnos|disorder|personality|subconscious|self-esteem|attachment|진단|성격|무의식/i;
const combineIntent = /结合|結合|一起|对照|對照|同时|同時|compare|combine|together|alongside|함께|비교/i;

export const planChatSources = (
  query: string,
  visualModelAvailable = false,
): SourcePlan => {
  const value = query.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (unsupportedIntent.test(value)) {
    return { source: 'unsupported', tools: [], maxCalls: 0 };
  }
  const mcpIntent = detectMyLifeMemoryMcpIntent(value);
  if (!mcpIntent.requested) {
    return { source: 'emotion_map_local', tools: [], maxCalls: 0 };
  }
  const source: ChatSource =
    (mcpIntent.explicitMyLifeMemory || mcpIntent.explicitMcp) &&
      !combineIntent.test(value)
    ? 'my_life_memory'
    : 'both';
  if (mcpIntent.route) return { source, tools: ['get_routes'], maxCalls: 1 };
  if (mcpIntent.photo && visualModelAvailable) {
    return {
      source,
      tools: ['research_memory_context', 'get_memory_images'],
      maxCalls: 2,
    };
  }
  return {
    source,
    tools: ['research_memory_context'],
    maxCalls: 1,
  };
};
