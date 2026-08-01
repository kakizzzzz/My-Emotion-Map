export type PhotoAssistResult = {
  titleSuggestion: string | null;
  optionalQuestions: string[];
};

const FORBIDDEN_INFERENCE = /焦虑|幸福|孤独|治愈|抑郁|紧张|人格|心理|动机|关系|诊断|anxious|happy|lonely|healing|depress|personality|motive|diagnos|불안|행복|외로|치유|우울|성격|심리|진단/i;
const ASSERTIVE_VISUAL_QUESTION = /(?:画面|照片|图中)(?:中|里)?(?:是|有|显示)|(?:the\s+(?:image|photo|picture)\s+(?:is|shows?|contains?)|there\s+(?:is|are)\s+.+\s+in\s+the\s+(?:image|photo|picture))|(?:사진|이미지|화면)(?:에는|은|는)?\s*(?:있|보여|이다|입니다)/i;
const CORRECTABLE_QUESTION = /似乎|好像|看起来|可能|也许|如果不是|还是其他|或其他|你觉得|seems?|appears?|looks? like|might|may|could|possibly|if not|or something else|what do you think|것 같|처럼 보|수도|아니라면|다른|어떻게 보/i;

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export const validatePhotoAssistResult = (value: unknown): PhotoAssistResult | null => {
  const result = asObject(value);
  const allowedKeys = new Set(['titleSuggestion', 'optionalQuestions']);
  if (!result || Object.keys(result).some((key) => !allowedKeys.has(key))) return null;
  const title = result.titleSuggestion;
  if (title !== null && typeof title !== 'string') return null;
  const normalizedTitle = typeof title === 'string' ? title.trim() : null;
  if (normalizedTitle && (normalizedTitle.length > 80 || FORBIDDEN_INFERENCE.test(normalizedTitle))) return null;
  if (!Array.isArray(result.optionalQuestions) || result.optionalQuestions.length > 2) return null;
  const questions = result.optionalQuestions.map((item) => typeof item === 'string' ? item.trim() : '');
  if (questions.some((item) =>
    !item || item.length > 180 || FORBIDDEN_INFERENCE.test(item) ||
    (ASSERTIVE_VISUAL_QUESTION.test(item) && !CORRECTABLE_QUESTION.test(item))
  )) return null;
  if (new Set(questions.map((item) => item.toLocaleLowerCase())).size !== questions.length) return null;
  return { titleSuggestion: normalizedTitle || null, optionalQuestions: questions };
};
