export type QueryIntent =
  | 'lookup'
  | 'comparison'
  | 'pattern'
  | 'reflection'
  | 'count_stats'
  | 'recent_records'
  | 'clarification_required'
  | 'unsupported';

export type ParsedQueryConstraints = {
  exactDate: string | null;
  dateRange: { start: string; end: string } | null;
  invalidDate: boolean;
};

const TRADITIONAL =
  '臺圖館學樓門靜邊書記錄數條幾這個裡後來時間點場處發現經驗變較與過還從為開關問說現當會讓體覺園區飯廳車站醫院線實總種樣無對應選擇聯繫歷應該導致為什麼嗎個們';
const SIMPLIFIED =
  '台图馆学楼门静边书记录数条几这个里后来时间点场处发现经验变较与过还从为开关问说现当会让体觉园区饭厅车站医院线实总种样无对应选择联系历应该导致为什么吗个们';
const TRADITIONAL_TO_SIMPLIFIED = new Map(
  [...TRADITIONAL].map((character, index) => [character, SIMPLIFIED[index]]),
);

export const normalizeQueryText = (value: string) =>
  [...value.normalize('NFKC')]
    .map((character) => TRADITIONAL_TO_SIMPLIFIED.get(character) ?? character)
    .join('')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const tokenizeQuery = (value: string) => {
  const normalized = normalizeQueryText(value);
  const tokens = new Set(normalized.match(/[a-z0-9]+|[\uac00-\ud7a3]+/g) ?? []);
  const cjkRuns = normalized.match(/[\u3400-\u9fff]+/g) ?? [];
  for (const run of cjkRuns) {
    if (run.length <= 2) tokens.add(run);
    else {
      for (let index = 0; index < run.length - 1; index += 1) {
        tokens.add(run.slice(index, index + 2));
      }
    }
  }
  return [...tokens].slice(0, 40);
};

const EMOTION_ALIASES: Record<string, string[]> = {
  calm: ['平静', 'calm', '평온'],
  joy: ['开心', '快乐', 'joy', 'happy', '기쁨'],
  tender: ['柔软', '温柔', 'tender', 'gentle', '부드러움'],
  curious: ['好奇', 'curious', '호기심'],
  energized: ['有活力', 'energized', '활력'],
  connected: ['亲近', 'connected', '친밀함'],
  focused: ['专注', 'focused', '집중'],
  restless: ['不安', 'restless', 'uneasy', '불안'],
  heavy: ['低落', '沉重', 'heavy', 'low', '가라앉음'],
  overwhelmed: ['过载', 'overwhelmed', '과부하'],
  numb: ['麻木', 'numb', '무감각'],
  mixed: ['混合', 'mixed', '복합'],
  unknown: ['未知', '未选择', 'unknown', 'not selected', '알 수 없음'],
};

export const extractExplicitEmotion = (query: string) => {
  const value = normalizeQueryText(query);
  return Object.entries(EMOTION_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => value.includes(normalizeQueryText(alias)))
  )?.[0] ?? null;
};

const DATE_PATTERNS = [
  /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/,
  /(20\d{2})年(\d{1,2})月(\d{1,2})日/,
];
const MONTH_DAY_PATTERN = /(?:^|\D)(\d{1,2})月(\d{1,2})日/;

const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const validCalendarDate = (year: number, month: number, day: number) => {
  const candidate = new Date(year, month - 1, day, 12);
  return candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 && candidate.getDate() === day;
};

export const parseQueryConstraints = (
  query: string,
  now = new Date(),
): ParsedQueryConstraints => {
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(query);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (!validCalendarDate(year, month, day)) {
        return { exactDate: null, dateRange: null, invalidDate: true };
      }
      return {
        exactDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        dateRange: null,
        invalidDate: false,
      };
    }
  }
  const monthDay = MONTH_DAY_PATTERN.exec(query);
  if (monthDay) {
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    const year = now.getFullYear();
    if (!validCalendarDate(year, month, day)) {
      return { exactDate: null, dateRange: null, invalidDate: true };
    }
    const candidate = new Date(year, month - 1, day, 12);
    const today = new Date(year, now.getMonth(), now.getDate(), 12);
    if (candidate > today) candidate.setFullYear(candidate.getFullYear() - 1);
    return { exactDate: localDate(candidate), dateRange: null, invalidDate: false };
  }
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (/今天|today|오늘/i.test(query)) {
    return { exactDate: localDate(end), dateRange: null, invalidDate: false };
  }
  if (/前天|day\s+before\s+yesterday|그저께/i.test(query)) {
    end.setDate(end.getDate() - 2);
    return { exactDate: localDate(end), dateRange: null, invalidDate: false };
  }
  if (/昨天|yesterday|어제/i.test(query)) {
    end.setDate(end.getDate() - 1);
    return { exactDate: localDate(end), dateRange: null, invalidDate: false };
  }
  const days = /最近\s*7\s*天|last\s*7\s*days|최근\s*7일/i.test(query)
    ? 7
    : /最近\s*30\s*天|last\s*30\s*days|최근\s*30일/i.test(query)
      ? 30
      : null;
  if (days) {
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    return {
      exactDate: null,
      dateRange: { start: localDate(start), end: localDate(end) },
      invalidDate: false,
    };
  }
  const range = (start: Date, rangeEnd: Date): ParsedQueryConstraints => ({
    exactDate: null,
    dateRange: { start: localDate(start), end: localDate(rangeEnd) },
    invalidDate: false,
  });
  if (/本周|this\s+week|이번\s*주/i.test(query)) {
    const start = new Date(end);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return range(start, end);
  }
  if (/上周|last\s+week|지난\s*주/i.test(query)) {
    const rangeEnd = new Date(end);
    rangeEnd.setDate(rangeEnd.getDate() - ((rangeEnd.getDay() + 6) % 7) - 1);
    const start = new Date(rangeEnd);
    start.setDate(start.getDate() - 6);
    return range(start, rangeEnd);
  }
  if (/本月|this\s+month|이번\s*달/i.test(query)) {
    return range(new Date(end.getFullYear(), end.getMonth(), 1, 12), end);
  }
  if (/上月|last\s+month|지난\s*달/i.test(query)) {
    const rangeEnd = new Date(end.getFullYear(), end.getMonth(), 0, 12);
    return range(new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1, 12), rangeEnd);
  }
  return { exactDate: null, dateRange: null, invalidDate: false };
};

export const isReferenceOnlyQuery = (query: string) => {
  const value = normalizeQueryText(query);
  return /^(?:第[一二三123]个(?:呢)?|上一条|刚才那条|那个地方|那里|that one|the (?:first|second|third) one|previous one|that place|첫 번째|두 번째|세 번째|이전 기록|그 장소)[？? ]*$/i.test(value);
};

export const parseComparisonTargets = (query: string) => {
  const value = normalizeQueryText(query)
    .replace(/^(?:比较|对比|compare|compare\s+|비교)\s*/i, '')
    .replace(/(?:有什么)?(?:不同|区别|difference|differences|차이)(?:是什么|吗|呢)?$/i, '')
    .replace(/(?:을|를)?\s*비교(?:해)?\s*주세요$/i, '')
    .trim();
  const cleanTarget = (item: string) => item
    .replace(/^(?:the|these|those)\s+/i, '')
    .replace(/\s*(?:的)?(?:记录|records?|기록)$/i, '')
    .replace(/[을를]$/u, '')
    .trim();
  const parts = value.split(/\s*(?:和|与|跟|及|versus|\bvs\b|\band\b|와|과|하고)\s*/i)
    .map(cleanTarget)
    .filter((item) => item.length > 0);
  return parts.length === 2 ? parts : [];
};

export const routeQueryIntent = (query: string): QueryIntent => {
  const constraints = parseQueryConstraints(query);
  if (constraints.invalidDate) return 'clarification_required';
  if (/诊断|抑郁症|焦虑症|人格|潜意识|diagnos|disorder|personality|subconscious|진단|성격|무의식/i.test(query)) {
    return 'unsupported';
  }
  if (/比较|相比|区别|versus|\bvs\b|compare|비교/i.test(query)) return 'comparison';
  if (/经常|重复|规律|哪些地方|pattern|often|repeat|자주|반복/i.test(query)) return 'pattern';
  if (/多少(?:条|次)?|几条|一共|总数|count|how many|몇 (?:개|번)|총 몇/i.test(query)) return 'count_stats';
  if (/最近(?:的)?记录|最新记录|recent records?|latest records?|최근 기록|최신 기록/i.test(query)) return 'recent_records';
  if (/怎么看|回看|想起|reflect|looking back|돌아보/i.test(query)) return 'reflection';
  if (isReferenceOnlyQuery(query)) return 'clarification_required';
  if (constraints.exactDate || constraints.dateRange || extractExplicitEmotion(query)) return 'lookup';
  const value = normalizeQueryText(query);
  if (!value || /^(你好|您好|嗨|hello|hi|hey|안녕(?:하세요)?)$/.test(value)) {
    return 'clarification_required';
  }
  return tokenizeQuery(value).length ? 'lookup' : 'clarification_required';
};
