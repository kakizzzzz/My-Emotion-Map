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
};

const unsupportedIntent = /诊断|抑郁症|焦虑症|人格|潜意识|自尊|依恋|diagnos|disorder|personality|subconscious|self-esteem|attachment|진단|성격|무의식/i;
const myLifeMemoryIntent = /my\s*life\s*memory|人生记忆|人生記憶|生活记忆|生活記憶|라이프\s*메모리/i;
const combineIntent = /结合|結合|一起|对照|對照|同时|同時|compare|combine|together|alongside|함께|비교/i;
const routeIntent = /路线|路線|轨迹|軌跡|行程|route|track|path|경로|동선/i;
const photoIntent = /照片|相片|图片|圖片|影像|photo|image|picture|사진|이미지/i;

export const planChatSources = (
  query: string,
  visualModelAvailable = false,
): SourcePlan => {
  const value = query.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (unsupportedIntent.test(value)) {
    return { source: 'unsupported', tools: [], maxCalls: 0 };
  }
  const explicitMlm = myLifeMemoryIntent.test(value);
  const explicitRoute = routeIntent.test(value);
  const explicitPhoto = photoIntent.test(value);
  if (!explicitMlm && !explicitRoute && !explicitPhoto) {
    return { source: 'emotion_map_local', tools: [], maxCalls: 0 };
  }
  const source: ChatSource = explicitMlm && !combineIntent.test(value)
    ? 'my_life_memory'
    : 'both';
  if (explicitRoute) return { source, tools: ['get_routes'], maxCalls: 1 };
  if (explicitPhoto && visualModelAvailable) {
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

