export type ChatLanguage = 'zh' | 'en' | 'ko';
export type ClaimKind =
  | 'record_fact'
  | 'similarity'
  | 'repeated_observation'
  | 'comparison'
  | 'hypothesis'
  | 'limitation';

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
};

export type GeneratedClaim = {
  claimId: string;
  kind: ClaimKind;
  text: string;
  evidenceKeys: string[];
};

export type GeneratedChatDraft = {
  status: 'supported' | 'evidence_insufficient' | 'unsupported';
  claims: GeneratedClaim[];
  limitations: string[];
};

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;

const normalized = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

const queryTerms = (query: string) => {
  const value = normalized(query);
  const latin = value.match(/[a-z0-9]+/g) ?? [];
  const hangul = value.match(/[\uac00-\ud7a3]{2,}/g) ?? [];
  const cjk = value.match(/[\u3400-\u9fff]{2,}/g) ?? [];
  const bigrams = [...hangul, ...cjk].flatMap((word) =>
    Array.from({ length: Math.max(word.length - 1, 0) }, (_, index) => word.slice(index, index + 2)),
  );
  return [...new Set([...latin, ...bigrams])].slice(0, 30);
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

const explicitEmotion = (query: string) => {
  const value = normalized(query);
  return Object.entries(EMOTION_ALIASES).find(([, aliases]) => aliases.some((alias) => value.includes(normalized(alias))))?.[0] ?? null;
};

const explicitDate = (query: string) => query.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] ?? null;

export const selectAuthorizedEvidence = (
  payload: unknown,
  query: string,
  selectedNoteIds: string[],
): AuthorizedEvidence[] => {
  const snapshot = asObject(payload);
  if (!snapshot || snapshot.dataMode !== 'real' || !Array.isArray(snapshot.notes) || !Array.isArray(snapshot.moments)) return [];
  const moments = new Map<string, JsonObject>();
  for (const value of snapshot.moments) {
    const moment = asObject(value);
    if (!moment || typeof moment.noteId !== 'string') continue;
    if (moment.isNew === true || moment.isInboxDraft === true) continue;
    moments.set(moment.noteId, moment);
  }
  const selected = new Set(selectedNoteIds);
  const terms = queryTerms(query);
  const date = explicitDate(query);
  const emotion = explicitEmotion(query);
  return snapshot.notes
    .map(asObject)
    .filter((note): note is JsonObject => Boolean(note && note.isDraft !== true && typeof note.id === 'string' && moments.has(note.id)))
    .map((note) => {
      const answers = Array.isArray(note.answers)
        ? note.answers.map(asObject).map((answer) =>
            answer && typeof answer.answer === 'string' ? answer.answer.trim().slice(0, 600) : '',
          ).filter(Boolean).slice(0, 3)
        : [];
      const candidate = {
        noteId: (note.id as string).slice(0, 200),
        title: typeof note.title === 'string' ? note.title.trim().slice(0, 200) : '',
        place: typeof note.place === 'string' ? note.place.trim().slice(0, 160) : '',
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
      const explicitId = selected.has(candidate.noteId);
      const exactDate = Boolean(date && candidate.date === date);
      const exactEmotion = Boolean(emotion && (emotion === 'unknown' ? candidate.emotion === null : candidate.emotion === emotion));
      const score = Number(explicitId) * 100 + Number(exactDate) * 20 + Number(exactEmotion) * 18 + titleMatches * 6 + placeMatches * 5 + answerMatches * 3;
      const matchReason = explicitId
        ? 'selected_record'
        : exactDate
          ? 'date_match'
          : exactEmotion
            ? 'emotion_match'
            : titleMatches
              ? 'title_match'
              : placeMatches
                ? 'place_match'
                : answerMatches
                  ? 'answer_match'
                  : 'recent_record';
      return { candidate, score, matchReason, occurredAt: `${candidate.date}T${candidate.time}` };
    })
    .filter((item) => item.score > 0 || terms.length === 0)
    .sort((left, right) => right.score - left.score || right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 6)
    .map((item, index) => ({ key: `E${index + 1}`, ...item.candidate, matchReason: item.matchReason }));
};

const CLAIM_KINDS = new Set<ClaimKind>([
  'record_fact', 'similarity', 'repeated_observation', 'comparison', 'hypothesis', 'limitation',
]);
const DIAGNOSIS = /诊断|抑郁症|焦虑症|创伤|精神疾病|diagnos|disorder|depression|anxiety disorder|진단|우울증|불안장애/i;
const CAUSAL = /导致|造成|因为.+所以|源于|证明了|让你(?:感到|变得)|使你|caused? by|causes?|because.+therefore|results? from|led to|makes? you|therefore|때문에|원인|그래서.+(?:됐|되었)|만들었/i;
const PERSONALITY = /人格|潜意识|自尊|依恋|心理机制|你就是|这说明你|personality|subconscious|self-esteem|attachment style|this means you|성격|무의식|자존감|애착/i;
const ADVICE = /你应该|你必须|你需要学会|建议你|不妨|可以试试|最好|记得要|you should|you must|you need to learn|I advise|consider trying|try to|it may help to|why not|해야 합니다|배워야|해 보세요|권합니다/i;
const UNSUPPORTED_VALENCE = /正在变好|已经改善|更糟了|正在恶化|被治愈|你很坚强|你很勇敢|做得很好|值得骄傲|这是失败|你很糟糕|getting better|has improved|getting worse|healed|you are (?:strong|brave|resilient)|proud of you|you failed|you are terrible|나아지고|악화|강하|용감|자랑스러|실패|최악/i;
const UNSUPPORTED_CURRENT_STATE = /你现在(?:很|正|感到|处于)|你此刻|currently you|you are (?:now|currently)|right now you|지금 당신|현재 당신/i;
const OVERGENERALIZATION = /你总是|你一直|你一贯|你的长期状态|you always|you consistently|your long-term state|you tend to|당신은 항상|계속해서|장기적인 상태/i;

const mentionsUnsupportedEmotion = (text: string, evidence: AuthorizedEvidence[]) => {
  const value = normalized(text);
  const mentioned = Object.entries(EMOTION_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => value.includes(normalized(alias))))
    .map(([key]) => key);
  if (!mentioned.length) return false;
  const available = new Set(evidence.map((item) => item.emotion ?? 'unknown'));
  return mentioned.some((key) => !available.has(key));
};

const factualTokensMatch = (text: string, evidence: AuthorizedEvidence[]) => {
  const allowed = normalized(evidence.flatMap((item) => [
    item.title, item.place, item.date, item.time, item.excerpt, ...item.answers,
  ]).join(' '));
  const dates = text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
  const numbers = text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  return dates.every((item) => allowed.includes(normalized(item))) && numbers.every((item) => allowed.includes(item));
};

export const parseGeneratedDraft = (value: unknown): GeneratedChatDraft | null => {
  const source = asObject(value);
  if (!source || (source.status !== 'supported' && source.status !== 'evidence_insufficient' && source.status !== 'unsupported')) return null;
  const allowedDraftKeys = new Set(['status', 'claims', 'limitations']);
  if (Object.keys(source).some((key) => !allowedDraftKeys.has(key)) ||
    !Array.isArray(source.claims) || source.claims.length > 8 ||
    !Array.isArray(source.limitations) || source.limitations.length > 5 ||
    source.limitations.some((item) => typeof item !== 'string')) return null;
  const claims: GeneratedClaim[] = [];
  for (const raw of source.claims) {
    const claim = asObject(raw);
    const allowedClaimKeys = new Set(['claimId', 'kind', 'text', 'evidenceKeys']);
    if (!claim || Object.keys(claim).some((key) => !allowedClaimKeys.has(key)) ||
      typeof claim.claimId !== 'string' || !claim.claimId.trim() ||
      !CLAIM_KINDS.has(claim.kind as ClaimKind) || typeof claim.text !== 'string' ||
      !claim.text.trim() || claim.text.length > 800 || !Array.isArray(claim.evidenceKeys)) return null;
    const evidenceKeys = claim.evidenceKeys.filter((key): key is string => typeof key === 'string');
    if (evidenceKeys.length !== claim.evidenceKeys.length || new Set(evidenceKeys).size !== evidenceKeys.length) return null;
    claims.push({ claimId: claim.claimId.slice(0, 80), kind: claim.kind as ClaimKind, text: claim.text.trim(), evidenceKeys });
  }
  if (new Set(claims.map((claim) => claim.claimId)).size !== claims.length) return null;
  const limitations = (source.limitations as string[])
    .map((item) => item.trim().slice(0, 300))
    .filter(Boolean)
  if (limitations.length !== source.limitations.length) return null;
  return { status: source.status, claims, limitations };
};

export const validateGeneratedDraft = (
  draft: GeneratedChatDraft,
  authorized: AuthorizedEvidence[],
) => {
  const evidenceByKey = new Map(authorized.map((item) => [item.key, item]));
  let highRisk = false;
  const validClaims = draft.claims.filter((claim) => {
    const evidence = claim.evidenceKeys.map((key) => evidenceByKey.get(key)).filter((item): item is AuthorizedEvidence => Boolean(item));
    if (evidence.length !== claim.evidenceKeys.length) return false;
    const minimum = claim.kind === 'repeated_observation' ? 3
      : claim.kind === 'similarity' || claim.kind === 'comparison' || claim.kind === 'hypothesis' ? 2
        : claim.kind === 'limitation' ? 0 : 1;
    if (evidence.length < minimum) return false;
    if (claim.kind === 'repeated_observation' && new Set(evidence.map((item) => item.date)).size < 3) return false;
    if (!factualTokensMatch(claim.text, evidence) || mentionsUnsupportedEmotion(claim.text, evidence)) return false;
    if (DIAGNOSIS.test(claim.text) || CAUSAL.test(claim.text) || PERSONALITY.test(claim.text) ||
      ADVICE.test(claim.text) || UNSUPPORTED_VALENCE.test(claim.text) ||
      UNSUPPORTED_CURRENT_STATE.test(claim.text) || OVERGENERALIZATION.test(claim.text)) {
      highRisk = true;
      return false;
    }
    return true;
  });
  const invalidRatio = draft.claims.length ? 1 - validClaims.length / draft.claims.length : 0;
  const validLimitations = draft.limitations.filter((text) => {
    if (!text || !factualTokensMatch(text, authorized) || mentionsUnsupportedEmotion(text, authorized)) return false;
    return !DIAGNOSIS.test(text) && !CAUSAL.test(text) && !PERSONALITY.test(text) &&
      !ADVICE.test(text) && !UNSUPPORTED_VALENCE.test(text) &&
      !UNSUPPORTED_CURRENT_STATE.test(text) && !OVERGENERALIZATION.test(text);
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
  zh: '我找到了与这个问题相关的已保存记录，但当前生成结果没有通过证据和表达边界检查。你可以打开下面的记录直接查看；现有数据不足以安全地产生进一步判断。',
  en: 'I found saved records related to this question, but the generated response did not pass the evidence and language checks. You can open the records below directly; the current data is not sufficient for a safe further conclusion.',
  ko: '이 질문과 관련된 저장 기록을 찾았지만, 생성 결과가 근거 및 표현 경계 검사를 통과하지 못했습니다. 아래 기록을 직접 열어볼 수 있으며, 현재 데이터만으로는 더 판단하기에 충분하지 않습니다.',
} as const)[language];

export const insufficientAnswer = (language: ChatLanguage) => ({
  zh: '现有的已保存记录不足以安全回答这个问题。',
  en: 'There are not enough saved records to answer this safely.',
  ko: '현재 저장된 기록만으로는 이 질문에 안전하게 답하기 어렵습니다.',
} as const)[language];
