const MY_LIFE_MEMORY = /my\s*life\s*memory|人生记忆|人生記憶|生活记忆|生活記憶|라이프\s*메모리/i;
const MCP = /\bmcp\b/i;
const ROUTE = /路线|路線|轨迹|軌跡|行程|route|track|path|경로|동선/i;
const PHOTO = /照片|相片|图片|圖片|影像|photo|image|picture|사진|이미지/i;
const VISUAL_REQUEST = /看看|查看|看一下|找|搜索|搜寻|搜尋|分析|识别|識別|读图|展示|show|find|search|look|view|analy[sz]e|inspect|recognize|찾아|검색|보여|분석|확인/i;
const PERSONAL_ARCHIVE_LOOKUP = /(?:(?:我|我的).{0,24}(?:之前|以前|过去|曾经|去过|到过|来过|历史).{0,24}(?:能|可以|是否)?.{0,8}(?:看到|看见|查到|找到|知道)|(?:能|可以).{0,10}(?:看到|看见|查到|找到).{0,24}(?:我|我的).{0,24}(?:之前|以前|过去|曾经|去过|到过|来过|历史)|have\s+i\s+(?:ever\s+)?(?:been|visited)|can\s+you\s+(?:see|find|check).{0,30}(?:my\s+)?(?:history|past|visits?))/i;
const PERSONAL_SCOPE = /(?:我|我的|本人|my|mine|i\s+(?:have|had|went|visited)|내|나의|제가|나는)/i;
const ARCHIVE_LOOKUP_ACTION = /(?:看看|看一下|查看|查找|查询|搜索|搜寻|找找|回看|回顾|整理|调取|知道|记得|show|find|search|check|look\s+(?:at|up)|review|recall|remember|찾아|검색|확인|돌아보|기억)/i;
const ARCHIVE_OBJECT = /(?:经历|回忆|记忆|记录|星星|足迹|旅程|旅行|行程|历史|去过|到过|来过|experience|memories|records?|stars?|footprints?|journeys?|trips?|travels?|visits?|history|경험|추억|기억|기록|별|여정|여행|방문|과거)/i;
const BARE_MCP_REQUEST = /^(?:(?:你|请|麻烦你)?\s*(?:调用|使用|用|查|看看|看一下)\s*(?:一下\s*)?mcp\s*(?:看看|看一下|查查|查询|吧|一下)?|(?:please\s+)?(?:call|use|check|query)\s+(?:the\s+)?mcp(?:\s+(?:please|tool))?|mcp)$/i;

type RecentMessage = {
  role: 'user' | 'assistant';
  body: string;
};

export type MyLifeMemoryMcpIntent = {
  requested: boolean;
  explicitMyLifeMemory: boolean;
  explicitMcp: boolean;
  archiveLookup: boolean;
  route: boolean;
  photo: boolean;
};

export const detectMyLifeMemoryMcpIntent = (
  query: string,
): MyLifeMemoryMcpIntent => {
  const value = query.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const explicitMyLifeMemory = MY_LIFE_MEMORY.test(value);
  const explicitMcp = MCP.test(value);
  const archiveLookup = PERSONAL_ARCHIVE_LOOKUP.test(value) || (
    PERSONAL_SCOPE.test(value) &&
    ARCHIVE_LOOKUP_ACTION.test(value) &&
    ARCHIVE_OBJECT.test(value)
  );
  const route = ROUTE.test(value);
  const photo = PHOTO.test(value) &&
    (explicitMyLifeMemory || explicitMcp || VISUAL_REQUEST.test(value));
  return {
    requested:
      explicitMyLifeMemory || explicitMcp || archiveLookup || route || photo,
    explicitMyLifeMemory,
    explicitMcp,
    archiveLookup,
    route,
    photo,
  };
};

export const contextualizeMcpRequest = (
  query: string,
  recentMessages: RecentMessage[],
) => {
  const value = query.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!BARE_MCP_REQUEST.test(value)) return query;
  const previousUserMessage = [...recentMessages]
    .reverse()
    .find((message) => message.role === 'user' && message.body.trim())
    ?.body.trim();
  return previousUserMessage
    ? `${previousUserMessage}\nMy Life Memory`
    : 'My Life Memory';
};
