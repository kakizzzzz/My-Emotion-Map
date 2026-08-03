import {
  extractExplicitEmotion,
  isReferenceOnlyQuery,
  normalizeQueryText,
  parseComparisonTargets,
  parseQueryConstraints,
  routeQueryIntent,
  tokenizeQuery,
  type QueryIntent,
} from '../../../src/domain/query/queryCore.ts';
import { detectMyLifeMemoryMcpIntent } from '../../../src/domain/query/mcpIntent.ts';

export type ChatLanguage = 'zh' | 'en' | 'ko';
export type ClaimKind =
  | 'record_fact'
  | 'repeated_observation'
  | 'comparison'
  | 'reflection'
  | 'limitation';

export type RetrievalStatus =
  | 'supported'
  | 'ambiguous'
  | 'not_found'
  | 'evidence_insufficient'
  | 'clarification_required'
  | 'unsupported'
  | 'unavailable';

export type AllowedFacts = {
  recordCount: number;
  computedFromCount: number;
  scope: 'all_matching_owner_records';
  episodeCount: number;
  dateCount: number;
  spanDays: number;
  dates: string[];
  repeatedEligible: boolean;
  possibleRepeatedEligible: boolean;
  stableRepeatedEligible: boolean;
};

export type AuthorizedEvidence = {
  key: string;
  noteId: string;
  title: string;
  place: string;
  date: string;
  time: string;
  emotion: string | null;
  excerpt: string;
  answers: string[];
  matchReason: string;
  source?: 'emotion_map_local' | 'my_life_memory_external';
  trust?: 'server_authorized_record' | 'untrusted_tool_data';
};

export type GeneratedClaim = {
  claimId: string;
  kind: ClaimKind;
  text: string;
  evidenceKeys: string[];
  allowedFactKeys: string[];
};

export type GeneratedChatDraft = {
  claims: GeneratedClaim[];
  limitations: string[];
};

export const MAX_CHAT_CLAIMS = 3;

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;

export const normalized = normalizeQueryText;
export const queryTerms = tokenizeQuery;
export const parseChatQueryConstraints = parseQueryConstraints;

const RECORD_SEEKING_QUERY = /(?:记录|笔记|星星|地图|回访|哪条|那条|刚才那条|my\s*emotion\s*map|saved\s+(?:record|note)|(?:my\s+)?(?:records?|notes?|stars?)|what\s+did\s+i\s+(?:save|record)|기록|노트|별|지도|후속)/i;

export const isCasualChatQuery = (query: string) => {
  const value = normalized(query);
  return Boolean(value) &&
    routeIntent(query) !== 'unsupported' &&
    !detectMyLifeMemoryMcpIntent(query).requested &&
    !RECORD_SEEKING_QUERY.test(value);
};

export const parseCasualReply = (value: unknown) => {
  const payload = asObject(value);
  if (!payload || Object.keys(payload).some((key) => key !== 'reply')) return null;
  const reply = typeof payload.reply === 'string'
    ? payload.reply.trim().slice(0, 2_000)
    : '';
  return reply || null;
};

const EMOTION_ALIASES: Record<string, string[]> = {
  calm: ['平静', 'calm', '평온'], joy: ['开心', '快乐', 'joy', 'happy', '기쁨'],
  tender: ['柔软', '温柔', 'tender', 'gentle', '부드러움'], curious: ['好奇', 'curious', '호기심'],
  energized: ['有活力', 'energized', '활력'], connected: ['亲近', 'connected', '친밀함'],
  focused: ['专注', 'focused', '집중'], restless: ['不安', 'restless', 'uneasy', '불안'],
  heavy: ['低落', '沉重', 'heavy', 'low', '가라앉음'], overwhelmed: ['过载', 'overwhelmed', '과부하'],
  numb: ['麻木', 'numb', '무감각'], mixed: ['混合', 'mixed', '복합'],
  unknown: ['未知', '未选择', 'unknown', 'not selected', '알 수 없음'],
};

export const routeIntent = routeQueryIntent;

export const computeAllowedFacts = (
  evidence: AuthorizedEvidence[],
): AllowedFacts => {
  const localEvidence = evidence.filter(
    (item) => item.source !== 'my_life_memory_external',
  );
  const ordered = [...localEvidence].sort((left, right) =>
    `${left.date}T${left.time || '00:00'}`.localeCompare(
      `${right.date}T${right.time || '00:00'}`,
    )
  );
  const lastEpisodeByPlace = new Map<string, { at: number; date: string }>();
  const episodes: Array<{ date: string }> = [];
  for (const item of ordered) {
    const placeKey = normalized(item.place) || `note:${item.noteId}`;
    const at = Date.parse(`${item.date}T${item.time || '00:00'}:00`);
    const previous = lastEpisodeByPlace.get(placeKey);
    if (
      previous && Number.isFinite(at) && at >= previous.at &&
      at - previous.at <= 90 * 60_000
    ) {
      previous.at = at;
      continue;
    }
    const episode = { at, date: item.date };
    lastEpisodeByPlace.set(placeKey, episode);
    episodes.push(episode);
  }
  const dates = [...new Set(episodes.map((item) => item.date).filter(Boolean))].sort();
  const first = dates[0] ? Date.parse(`${dates[0]}T12:00:00Z`) : 0;
  const last = dates.at(-1) ? Date.parse(`${dates.at(-1)}T12:00:00Z`) : first;
  const spanDays = Math.max(0, Math.round((last - first) / 86_400_000));
  return {
    recordCount: localEvidence.length,
    computedFromCount: localEvidence.length,
    scope: 'all_matching_owner_records',
    episodeCount: episodes.length,
    dateCount: dates.length,
    spanDays,
    dates,
    possibleRepeatedEligible: episodes.length >= 2 && dates.length >= 2,
    repeatedEligible: episodes.length >= 3 && dates.length >= 3,
    stableRepeatedEligible:
      episodes.length >= 5 && dates.length >= 4 && spanDays >= 21,
  };
};

export const resolveRetrievalStatus = (
  intent: QueryIntent,
  evidence: AuthorizedEvidence[],
  scores: number[],
  query = '',
): RetrievalStatus => {
  if (intent === 'unsupported') return 'unsupported';
  if (intent === 'clarification_required') return 'clarification_required';
  if (!evidence.length) return 'not_found';
  const facts = computeAllowedFacts(evidence);
  if (intent === 'comparison' && evidence.length < 2) return 'evidence_insufficient';
  if (intent === 'pattern' && !facts.repeatedEligible) return 'evidence_insufficient';
  if (
    (intent === 'lookup' || intent === 'reflection') &&
    !/(?:经历|回忆|记忆|足迹|旅程|旅行|行程|去过|到过|所有|全部|相关记录|experiences?|memories|journeys?|trips?|travels?|visits?|all\s+(?:records?|notes?)|경험|추억|여정|여행|방문)/i.test(query) &&
    scores.length > 1 && scores[0] - scores[1] < 8
  ) return 'ambiguous';
  return 'supported';
};

export type RetrievalOptions = {
  explicitNoteIds?: string[];
  conversationAnchorNoteIds?: string[];
  restrictToExplicit?: boolean;
  resolvedReferenceNoteIds?: string[];
};

export type AuthorizedRetrieval = {
  intent: QueryIntent;
  retrievalStatus: RetrievalStatus;
  evidence: AuthorizedEvidence[];
  computationSet: AuthorizedEvidence[];
  allowedFacts: AllowedFacts;
};

const rankAuthorizedEvidence = (
  payload: unknown,
  query: string,
  explicitNoteIds: string[],
  resolvedReferenceNoteIds: string[] = [],
): Array<{ evidence: AuthorizedEvidence; score: number }> => {
  const snapshot = asObject(payload);
  if (!snapshot || snapshot.dataMode !== 'real' || !Array.isArray(snapshot.notes) || !Array.isArray(snapshot.moments)) return [];
  const moments = new Map<string, JsonObject>();
  for (const value of snapshot.moments) {
    const moment = asObject(value);
    if (!moment || typeof moment.noteId !== 'string') continue;
    if (moment.isNew === true || moment.isInboxDraft === true) continue;
    moments.set(moment.noteId, moment);
  }
  const selected = new Set([...explicitNoteIds, ...resolvedReferenceNoteIds]);
  const normalizedQuery = normalized(query);
  const shortQuery = /^[\p{L}\p{N}]{1,2}$/u.test(normalizedQuery);
  const intent = routeIntent(query);
  const comparisonTerms = intent === 'comparison'
    ? parseComparisonTargets(query).map(normalized)
    : [];
  const terms = shortQuery
    ? []
    : [...new Set([...queryTerms(query), ...comparisonTerms])];
  const constraints = parseQueryConstraints(query);
  if (constraints.invalidDate) return [];
  const date = constraints.exactDate;
  const dateRange = constraints.dateRange;
  const emotion = extractExplicitEmotion(query);
  const hasCurrentConstraint = Boolean(date || dateRange || emotion);
  if (
    !selected.size && !date && !dateRange && !emotion && !terms.length &&
    !shortQuery
  ) return [];
  return snapshot.notes
    .map(asObject)
    .filter((note): note is JsonObject => Boolean(note && note.isDraft !== true && typeof note.id === 'string' && moments.has(note.id)))
    .map((note) => {
      const moment = moments.get(note.id as string);
      const answers = Array.isArray(note.answers)
        ? note.answers.map(asObject).map((answer) =>
            answer && typeof answer.answer === 'string' ? answer.answer.trim().slice(0, 600) : '',
          ).filter(Boolean).slice(0, 3)
        : [];
      const candidate = {
        noteId: (note.id as string).slice(0, 200),
        title: typeof note.title === 'string' ? note.title.trim().slice(0, 200) : '',
        place: moment?.locationTimeRelation === 'confirmation'
          ? ''
          : typeof note.place === 'string'
            ? note.place.trim().slice(0, 160)
            : '',
        date: typeof note.date === 'string' ? note.date.slice(0, 10) : '',
        time: typeof note.time === 'string' ? note.time.slice(0, 5) : '',
        emotion: typeof note.emotion === 'string' ? note.emotion.slice(0, 40) : null,
        excerpt: typeof note.excerpt === 'string' ? note.excerpt.trim().slice(0, 600) : '',
        answers,
      };
      const titleText = normalized(candidate.title);
      const placeText = normalized(candidate.place);
      const answerText = normalized(`${candidate.excerpt} ${candidate.answers.join(' ')}`);
      const titleMatches = terms.filter((term) => titleText.includes(term)).length;
      const placeMatches = terms.filter((term) => placeText.includes(term)).length;
      const answerMatches = terms.filter((term) => answerText.includes(term)).length;
      const exactShortLabel = shortQuery &&
        (titleText === normalizedQuery || placeText === normalizedQuery);
      const explicitId = selected.has(candidate.noteId) && !hasCurrentConstraint;
      const exactDate = Boolean(date && candidate.date === date);
      const insideDateRange = Boolean(
        dateRange &&
        candidate.date >= dateRange.start &&
        candidate.date <= dateRange.end,
      );
      const exactEmotion = Boolean(emotion && (emotion === 'unknown' ? candidate.emotion === null : candidate.emotion === emotion));
      let score = Number(explicitId) * 100 + Number(exactDate) * 40 +
        Number(insideDateRange) * 30 + Number(exactEmotion) * 28 +
        Number(exactShortLabel) * 32 +
        titleMatches * 8 + placeMatches * 7 + answerMatches * 3;
      if (
        score === 0 &&
        (intent === 'recent_records' || intent === 'count_stats' ||
          (intent === 'pattern' && /哪些地方|经常|规律|pattern|often|자주/i.test(query)))
      ) score = 1;
      const matchReason = explicitId
        ? 'selected_record'
        : exactDate
          ? 'date_match'
          : exactEmotion
            ? 'emotion_match'
          : insideDateRange
              ? 'date_range_match'
              : exactShortLabel
                ? 'exact_label_match'
              : titleMatches
              ? 'title_match'
              : placeMatches
                ? 'place_match'
                : answerMatches
                  ? 'answer_match'
                  : 'recent_record';
      return { candidate, score, matchReason, occurredAt: `${candidate.date}T${candidate.time}` };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.occurredAt.localeCompare(left.occurredAt))
    .map((item, index) => ({
      score: item.score,
      evidence: {
        key: `E${index + 1}`,
        ...item.candidate,
        matchReason: item.matchReason,
        source: 'emotion_map_local',
        trust: 'server_authorized_record',
      },
    }));
};

export const selectAuthorizedEvidence = (
  payload: unknown,
  query: string,
  explicitNoteIds: string[],
): AuthorizedEvidence[] =>
  rankAuthorizedEvidence(payload, query, explicitNoteIds).slice(0, 6).map(
    (item) => item.evidence,
  );

export const retrieveAuthorizedEvidence = (
  payload: unknown,
  query: string,
  options: RetrievalOptions | string[] = {},
  legacyRestrictToSelected = false,
): AuthorizedRetrieval => {
  const normalizedOptions: RetrievalOptions = Array.isArray(options)
    ? { explicitNoteIds: options, restrictToExplicit: legacyRestrictToSelected }
    : options;
  const routedIntent = routeIntent(query);
  const intent = routedIntent === 'clarification_required' &&
      (normalizedOptions.resolvedReferenceNoteIds?.length ?? 0) > 0
    ? 'lookup'
    : routedIntent;
  if (intent === 'unsupported' || intent === 'clarification_required') {
    return {
      intent,
      retrievalStatus: intent,
      evidence: [] as AuthorizedEvidence[],
      computationSet: [] as AuthorizedEvidence[],
      allowedFacts: computeAllowedFacts([]),
    };
  }
  const explicitNoteIds = normalizedOptions.explicitNoteIds ?? [];
  const resolvedReferenceNoteIds = normalizedOptions.resolvedReferenceNoteIds ?? [];
  const selected = new Set([...explicitNoteIds, ...resolvedReferenceNoteIds]);
  const ranked = rankAuthorizedEvidence(
    payload,
    query,
    explicitNoteIds,
    resolvedReferenceNoteIds,
  ).filter((item) =>
    !normalizedOptions.restrictToExplicit || selected.has(item.evidence.noteId)
  );
  const computationSet = ranked.map((item) => item.evidence);
  const evidence = computationSet.slice(0, 6).map((item, index) => ({
    ...item,
    key: `E${index + 1}`,
  }));
  const retrievalStatus = resolveRetrievalStatus(
    intent,
    computationSet,
    ranked.map((item) => item.score),
    query,
  );
  const comparisonTargets = intent === 'comparison'
    ? parseComparisonTargets(query)
    : [];
  const comparisonStatus = intent === 'comparison' && comparisonTargets.length !== 2
    ? 'clarification_required' as const
    : intent === 'comparison' && comparisonTargets.some((target) =>
        !computationSet.some((item) => normalized(
          `${item.title} ${item.place} ${item.excerpt} ${item.answers.join(' ')}`,
        ).includes(target))
      )
      ? 'evidence_insufficient' as const
      : retrievalStatus;
  return {
    intent,
    retrievalStatus: comparisonStatus,
    evidence,
    computationSet,
    allowedFacts: computeAllowedFacts(computationSet),
  };
};

export const resolveConversationReference = (
  payload: unknown,
  conversationId: string,
  query: string,
  clientAnchorNoteIds: string[],
) => {
  if (!isReferenceOnlyQuery(query)) {
    return { status: 'none' as const, noteIds: [] as string[] };
  }
  const snapshot = asObject(payload);
  const conversations = Array.isArray(snapshot?.conversations)
    ? snapshot.conversations.map(asObject)
    : [];
  const conversation = conversations.find((item) => item?.id === conversationId);
  if (!conversation || !Array.isArray(conversation.messages)) {
    return { status: 'clarification_required' as const, noteIds: [] as string[] };
  }
  const formalIds = new Set<string>();
  const moments = Array.isArray(snapshot?.moments) ? snapshot.moments.map(asObject) : [];
  for (const moment of moments) {
    if (
      typeof moment?.noteId === 'string' && moment.isNew !== true &&
      moment.isInboxDraft !== true
    ) formalIds.add(moment.noteId);
  }
  const clientAnchors = new Set(clientAnchorNoteIds);
  const recent = conversation.messages.slice(-8).map(asObject).filter(Boolean);
  const assistant = [...recent].reverse().find((message) =>
    message?.role === 'assistant' && Array.isArray(message.noteIds)
  );
  const serverAnchors = Array.isArray(assistant?.noteIds)
    ? assistant.noteIds.filter((id): id is string =>
        typeof id === 'string' && formalIds.has(id) &&
        (!clientAnchors.size || clientAnchors.has(id))
      ).slice(0, 6)
    : [];
  if (!serverAnchors.length) {
    return { status: 'clarification_required' as const, noteIds: [] as string[] };
  }
  const value = normalized(query);
  const ordinal = /(?:第二个|the second one|두 번째)/i.test(value) ? 1
    : /(?:第三个|the third one|세 번째)/i.test(value) ? 2
      : /(?:第一个|the first one|첫 번째)/i.test(value) ? 0 : null;
  if (ordinal !== null) {
    const noteId = serverAnchors[ordinal];
    return noteId
      ? { status: 'resolved' as const, noteIds: [noteId] }
      : { status: 'clarification_required' as const, noteIds: [] as string[] };
  }
  if (/上一条|刚才那条|previous one|이전 기록/i.test(value)) {
    return { status: 'resolved' as const, noteIds: [serverAnchors[0]] };
  }
  if (/那个地方|那里|that place|그 장소/i.test(value)) {
    const notes = Array.isArray(snapshot?.notes) ? snapshot.notes.map(asObject) : [];
    const placeById = new Map(notes.flatMap((note) =>
      typeof note?.id === 'string' && typeof note.place === 'string'
        ? [[note.id, normalized(note.place)] as const]
        : []
    ));
    const places = new Set(serverAnchors.map((id) => placeById.get(id)).filter(Boolean));
    return places.size === 1
      ? { status: 'resolved' as const, noteIds: serverAnchors }
      : { status: 'clarification_required' as const, noteIds: [] as string[] };
  }
  return { status: 'clarification_required' as const, noteIds: [] as string[] };
};

const CLAIM_KINDS = new Set<ClaimKind>([
  'record_fact', 'repeated_observation', 'comparison', 'reflection', 'limitation',
]);
const DIAGNOSIS = /诊断|抑郁症|焦虑症|创伤|精神疾病|diagnos|disorder|depression|anxiety disorder|진단|우울증|불안장애/i;
const CAUSAL = /导致|造成|因为.+所以|源于|证明了|让你(?:感到|变得)|使你|caused? by|causes?|because.+therefore|results? from|led to|makes? you|therefore|때문에|원인|그래서.+(?:됐|되었)|만들었/i;
const PERSONALITY = /人格|潜意识|自尊|依恋|心理机制|你就是|这说明你|personality|subconscious|self-esteem|attachment style|this means you|성격|무의식|자존감|애착/i;
const ADVICE = /你应该|你必须|你需要学会|建议你|不妨|可以试试|最好|记得要|you should|you must|you need to learn|I advise|consider trying|try to|it may help to|why not|해야 합니다|배워야|해 보세요|권합니다/i;
const UNSUPPORTED_VALENCE = /正在变好|已经改善|更糟了|正在恶化|被治愈|你很坚强|你很勇敢|做得很好|值得骄傲|这是失败|你很糟糕|getting better|has improved|getting worse|healed|you are (?:strong|brave|resilient)|proud of you|you failed|you are terrible|나아지고|악화|강하|용감|자랑스러|실패|최악/i;
const UNSUPPORTED_CURRENT_STATE = /你现在(?:很|正|感到|处于)|你此刻|currently you|you are (?:now|currently)|right now you|지금 당신|현재 당신/i;
const OVERGENERALIZATION = /你总是|你一直|你一贯|你的长期状态|you always|you consistently|your long-term state|you tend to|당신은 항상|계속해서|장기적인 상태/i;
const PROMPT_INJECTION = /忽略.{0,20}(?:系统|规则|指令)|系统提示|开发者消息|泄露.{0,12}(?:密钥|秘密)|ignore.{0,30}(?:system|instruction|rules)|system prompt|developer message|disclose.{0,20}(?:secret|key)|시스템.{0,20}(?:무시|프롬프트)|비밀.{0,12}(?:공개|노출)/i;

const mentionsUnsupportedEmotion = (text: string, evidence: AuthorizedEvidence[]) => {
  const value = normalized(text);
  const mentioned = Object.entries(EMOTION_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => value.includes(normalized(alias))))
    .map(([key]) => key);
  if (!mentioned.length) return false;
  const available = new Set(evidence.map((item) => item.emotion ?? 'unknown'));
  return mentioned.some((key) => !available.has(key));
};

const factualTokensMatch = (
  text: string,
  evidence: AuthorizedEvidence[],
  allowedFacts: AllowedFacts = computeAllowedFacts(evidence),
) => {
  const allowed = normalized(evidence.flatMap((item) => [
    item.title, item.place, item.date, item.time, item.excerpt, ...item.answers,
  ]).join(' '));
  const dates = text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
  const numbers = text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  const allowedNumbers = new Set([
    String(allowedFacts.recordCount),
    String(allowedFacts.dateCount),
    String(allowedFacts.spanDays),
  ]);
  const allowedDates = new Set(evidence.map((item) => item.date).filter(Boolean));
  return dates.every((item) => allowedDates.has(item)) &&
    numbers.every((item) => allowed.includes(item) || allowedNumbers.has(item));
};

export const parseGeneratedDraft = (value: unknown): GeneratedChatDraft | null => {
  const source = asObject(value);
  if (!source) return null;
  const allowedDraftKeys = new Set(['claims', 'limitations']);
  if (Object.keys(source).some((key) => !allowedDraftKeys.has(key)) ||
    !Array.isArray(source.claims) || source.claims.length > MAX_CHAT_CLAIMS ||
    !Array.isArray(source.limitations) || source.limitations.length > 5 ||
    source.limitations.some((item) => typeof item !== 'string')) return null;
  const claims: GeneratedClaim[] = [];
  for (const raw of source.claims) {
    const claim = asObject(raw);
    const allowedClaimKeys = new Set(['claimId', 'kind', 'text', 'evidenceKeys', 'allowedFactKeys']);
    if (!claim || Object.keys(claim).some((key) => !allowedClaimKeys.has(key)) ||
      typeof claim.claimId !== 'string' || !claim.claimId.trim() ||
      !CLAIM_KINDS.has(claim.kind as ClaimKind) || typeof claim.text !== 'string' ||
      !claim.text.trim() || claim.text.length > 800 || !Array.isArray(claim.evidenceKeys) ||
      !Array.isArray(claim.allowedFactKeys)) return null;
    const evidenceKeys = claim.evidenceKeys.filter((key): key is string => typeof key === 'string');
    if (evidenceKeys.length !== claim.evidenceKeys.length || new Set(evidenceKeys).size !== evidenceKeys.length) return null;
    const allowedFactKeys = claim.allowedFactKeys.filter(
      (key): key is string => typeof key === 'string',
    );
    if (allowedFactKeys.length !== claim.allowedFactKeys.length) return null;
    claims.push({ claimId: claim.claimId.slice(0, 80), kind: claim.kind as ClaimKind, text: claim.text.trim(), evidenceKeys, allowedFactKeys });
  }
  if (new Set(claims.map((claim) => claim.claimId)).size !== claims.length) return null;
  const limitations = (source.limitations as string[])
    .map((item) => item.trim().slice(0, 300))
    .filter(Boolean)
  if (limitations.length !== source.limitations.length) return null;
  return { claims, limitations };
};

export const validateGeneratedDraft = (
  draft: GeneratedChatDraft,
  authorized: AuthorizedEvidence[],
  allowedFacts: AllowedFacts = computeAllowedFacts(authorized),
) => {
  const evidenceByKey = new Map(authorized.map((item) => [item.key, item]));
  let highRisk = false;
  const validClaims = draft.claims.filter((claim) => {
    const evidence = claim.evidenceKeys.map((key) => evidenceByKey.get(key)).filter((item): item is AuthorizedEvidence => Boolean(item));
    if (evidence.length !== claim.evidenceKeys.length) return false;
    const minimum = claim.kind === 'repeated_observation' ? 3
      : claim.kind === 'comparison' ? 2
        : claim.kind === 'limitation' ? 0 : 1;
    if (evidence.length < minimum) return false;
    if (claim.kind === 'repeated_observation' && !allowedFacts.repeatedEligible) return false;
    if (claim.kind === 'repeated_observation' &&
      evidence.some((item) => item.source === 'my_life_memory_external')) return false;
    const allowedFactKeySet = new Set([
      'recordCount', 'dateCount', 'spanDays', 'repeatedEligible', 'stableRepeatedEligible',
      'computedFromCount', 'episodeCount', 'possibleRepeatedEligible', 'scope',
    ]);
    if (claim.allowedFactKeys.some((key) => !allowedFactKeySet.has(key))) return false;
    if (!factualTokensMatch(claim.text, evidence, allowedFacts) || mentionsUnsupportedEmotion(claim.text, evidence)) return false;
    if (DIAGNOSIS.test(claim.text) || CAUSAL.test(claim.text) || PERSONALITY.test(claim.text) ||
      ADVICE.test(claim.text) || UNSUPPORTED_VALENCE.test(claim.text) ||
      UNSUPPORTED_CURRENT_STATE.test(claim.text) || OVERGENERALIZATION.test(claim.text) ||
      PROMPT_INJECTION.test(claim.text)) {
      highRisk = true;
      return false;
    }
    return true;
  });
  const invalidRatio = draft.claims.length ? 1 - validClaims.length / draft.claims.length : 0;
  const validLimitations = draft.limitations.filter((text) => {
    if (!text || !factualTokensMatch(text, authorized, allowedFacts) || mentionsUnsupportedEmotion(text, authorized)) return false;
    return !DIAGNOSIS.test(text) && !CAUSAL.test(text) && !PERSONALITY.test(text) &&
      !ADVICE.test(text) && !UNSUPPORTED_VALENCE.test(text) &&
      !UNSUPPORTED_CURRENT_STATE.test(text) && !OVERGENERALIZATION.test(text) &&
      !PROMPT_INJECTION.test(text);
  });
  if (validLimitations.length !== draft.limitations.length) highRisk = true;
  return {
    validClaims,
    validLimitations,
    retry: highRisk || invalidRatio > 0.25,
    highRisk,
  };
};

export const deterministicFallback = (language: ChatLanguage) => ({
  zh: '我找到了相关记录，但这次回答没有通过事实核对，所以没有把不可靠的内容发给你。下面的记录仍可以直接打开，我们可以继续从其中一条聊起。',
  en: 'I found relevant records, but this reply did not pass the fact check, so I did not send you unreliable content. You can still open the records below, and we can continue from any one of them.',
  ko: '관련 기록을 찾았지만, 이번 답변은 사실 확인을 통과하지 못해 신뢰할 수 없는 내용을 보내지 않았어요. 아래 기록은 그대로 열어볼 수 있고, 그중 하나부터 이어서 이야기할 수 있어요.',
} as const)[language];

export const formatRecentPlacesAnswer = (
  language: ChatLanguage,
  evidence: AuthorizedEvidence[],
) => {
  const seen = new Set<string>();
  const places = [...evidence]
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
    .filter((item) => {
      const key = [item.title, item.place, item.date].map(normalized).join('|');
      if (!item.key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
  if (!places.length) return null;
  const fallbackTitle = {
    zh: '已保存地点',
    en: 'Saved place',
    ko: '저장된 장소',
  } as const;
  const intro = {
    zh: '最近的已保存地点记录，按时间从近到远：',
    en: 'Your recent saved place records, from newest to oldest:',
    ko: '최근 저장된 장소 기록을 최신순으로 정리했어요:',
  } as const;
  return {
    answer: [
      intro[language],
      ...places.map((item) =>
        `• ${item.title.trim() || fallbackTitle[language]}${item.date ? ` · ${item.date}` : ''}`),
    ].join('\n'),
    evidenceKeys: places.map((item) => item.key),
  };
};

export const insufficientAnswer = (language: ChatLanguage) => ({
  zh: '现有的已保存记录不足以安全回答这个问题。',
  en: 'There are not enough saved records to answer this safely.',
  ko: '현재 저장된 기록만으로는 이 질문에 안전하게 답하기 어렵습니다.',
} as const)[language];

export const notFoundAnswer = (language: ChatLanguage) => ({
  zh: '没有找到符合这些条件的已保存记录。',
  en: 'No saved records matched those conditions.',
  ko: '해당 조건과 일치하는 저장 기록을 찾지 못했습니다.',
} as const)[language];

export const ambiguousAnswer = (language: ChatLanguage) => ({
  zh: '找到几条相近记录，请先选一条。',
  en: 'I found several similar records. Choose one first.',
  ko: '비슷한 기록을 여러 개 찾았습니다. 먼저 하나를 선택해 주세요.',
} as const)[language];

export const clarificationRequiredAnswer = (language: ChatLanguage) => ({
  zh: '请再说明你想查看的记录、日期或地点。',
  en: 'Please specify the record, date, or place you want to view.',
  ko: '확인할 기록, 날짜 또는 장소를 조금 더 구체적으로 알려 주세요.',
} as const)[language];

export const recentConversationContext = (
  payload: unknown,
  conversationId: string,
) => {
  const snapshot = asObject(payload);
  if (!snapshot || !Array.isArray(snapshot.conversations)) return [];
  const conversation = snapshot.conversations
    .map(asObject)
    .find((item) => item?.id === conversationId);
  if (!conversation || !Array.isArray(conversation.messages)) return [];
  const selected: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let characters = 0;
  for (const raw of [...conversation.messages].reverse()) {
    const message = asObject(raw);
    if (
      !message ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.body !== 'string'
    ) {
      continue;
    }
    const content = message.body.trim().slice(0, 1_200);
    if (!content || characters + content.length > 4_000) break;
    selected.unshift({ role: message.role, content });
    characters += content.length;
    if (selected.length >= 8) break;
  }
  return selected;
};
