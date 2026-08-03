import { EMOTIONS, EMOTION_ORDER } from '../data';
import type {
  EmotionKey,
  EmotionNote,
  GuidedAnswer,
  PlaceRating,
  PromptRole,
} from '../types';
import type { AppLanguage } from '../i18n';
import { createRecordId } from '../app/createRecordId';

export const STAR_COLORS = [
  '#D2936D', '#B6A5B9', '#EDC727', '#88AA9A', '#C4D4C5', '#D0D5C1',
  '#CBE0E8', '#80AACD', '#D3CCE3', '#F0EBE1', '#28292B',
];

export const PURPOSE_QUESTION: Record<AppLanguage, string> = {
  zh: '你去这做什么？',
  en: 'What did you come here to do?',
  ko: '여기에 무엇을 하러 왔나요?',
};

const FALLBACK_QUESTIONS: Record<AppLanguage, readonly string[]> = {
  zh: ['这里有什么让你注意到的？', '你想为以后留下什么？'],
  en: ['What stood out to you here?', 'What would you like to leave for later?'],
  ko: ['여기에서 무엇이 눈에 들어왔나요?', '나중을 위해 무엇을 남기고 싶나요?'],
};

const PURPOSE_ALIASES = new Set([
  '你去这里做什么？', '你去这做什么？', '你在这里做了什么？',
  'What did you do here?', 'What did you come here to do?',
  '여기에서 무엇을 했나요?', '여기에 무엇을 하러 왔나요?',
].map((value) => value.toLocaleLowerCase()));

const PLACE_RATINGS: Array<{ key: PlaceRating; label: string; short: string }> = [
  { key: 'safe', label: '很安心', short: '安心' },
  { key: 'comfortable', label: '比较舒服', short: '舒服' },
  { key: 'neutral', label: '没特别感觉', short: '还好' },
  { key: 'uneasy', label: '有点不舒服', short: '不适' },
  { key: 'distressing', label: '很难受', short: '难受' },
];

export const EMOTION_LABELS: Record<AppLanguage, Record<EmotionKey, string>> = {
  zh: Object.fromEntries(EMOTION_ORDER.map((key) => [key, EMOTIONS[key].label])) as Record<EmotionKey, string>,
  en: { calm: 'Calm', joy: 'Happy', tender: 'Gentle', curious: 'Curious', energized: 'Energized', connected: 'Connected', heavy: 'Low', restless: 'Uneasy', focused: 'Focused', overwhelmed: 'Overloaded', numb: 'Numb', mixed: 'Mixed' },
  ko: { calm: '평온', joy: '기쁨', tender: '부드러움', curious: '호기심', energized: '활력', connected: '친밀함', heavy: '가라앉음', restless: '불안', focused: '집중', overwhelmed: '과부하', numb: '무감각', mixed: '복합' },
};

export const getEmotionLabel = (emotion: EmotionKey | null, language: AppLanguage) =>
  emotion === null ? ({ zh: '未知', en: 'Unknown', ko: '알 수 없음' } as const)[language] : EMOTION_LABELS[language][emotion];

export const getPlaceRatings = (language: AppLanguage) => {
  if (language === 'en') return [
    { key: 'safe', label: 'Very safe', short: 'Safe' }, { key: 'comfortable', label: 'Comfortable', short: 'Comfort' },
    { key: 'neutral', label: 'No strong feeling', short: 'Neutral' }, { key: 'uneasy', label: 'A little uneasy', short: 'Uneasy' },
    { key: 'distressing', label: 'Very distressing', short: 'Distress' },
  ] as const;
  if (language === 'ko') return [
    { key: 'safe', label: '매우 안심됨', short: '안심' }, { key: 'comfortable', label: '편안함', short: '편안' },
    { key: 'neutral', label: '특별한 느낌 없음', short: '보통' }, { key: 'uneasy', label: '조금 불편함', short: '불편' },
    { key: 'distressing', label: '매우 힘듦', short: '힘듦' },
  ] as const;
  return PLACE_RATINGS;
};

export const createGuidedAnswers = (language: AppLanguage): GuidedAnswer[] => [
  { id: createRecordId('prompt'), question: PURPOSE_QUESTION[language], answer: '', role: 'purpose' },
  ...FALLBACK_QUESTIONS[language].map((question) => ({ id: createRecordId('prompt'), question, answer: '', role: 'fallback' as const })),
];

export const getGuidedQuestions = (language: AppLanguage): string[] =>
  createGuidedAnswers(language).map((answer) => answer.question);

export const getQuestionPresets = (language: AppLanguage): string[] =>
  [...FALLBACK_QUESTIONS[language]];

const inferRole = (question: string, index: number): PromptRole =>
  index === 0 && PURPOSE_ALIASES.has(question.trim().toLocaleLowerCase()) ? 'purpose' : 'legacy';

export const normalizeGuidedAnswers = (source: EmotionNote['answers']): EmotionNote['answers'] =>
  source.map((answer, index) => ({
    id: answer.id || createRecordId('prompt'),
    question: answer.question.trim() || (index === 0 ? PURPOSE_QUESTION.zh : FALLBACK_QUESTIONS.zh[Math.min(index - 1, 1)]),
    answer: answer.answer ?? '',
    role: answer.role ?? inferRole(answer.question, index),
  }));

export const normalizeNewRecordPrompts = (
  source: EmotionNote['answers'],
  language: AppLanguage,
): EmotionNote['answers'] => {
  const normalized = normalizeGuidedAnswers(source);
  const purpose = normalized.find((answer) => answer.role === 'purpose');
  const optional = normalized.filter((answer) => answer !== purpose).slice(0, 7);
  return [
    { id: purpose?.id ?? createRecordId('prompt'), question: PURPOSE_QUESTION[language], answer: purpose?.answer ?? '', role: 'purpose' },
    ...optional,
  ];
};

export const isPurposePrompt = (answer: GuidedAnswer | undefined) => answer?.role === 'purpose';

export const applyAiOptionalQuestions = (
  source: EmotionNote['answers'],
  questions: string[],
  language: AppLanguage,
): EmotionNote['answers'] => {
  const normalized = normalizeNewRecordPrompts(source, language);
  const purpose = normalized[0] ?? createGuidedAnswers(language)[0];
  const unique = [...new Set(
    questions.map((question) => question.trim()).filter(Boolean),
  )]
    .filter((question) => !PURPOSE_ALIASES.has(question.toLocaleLowerCase()))
    .slice(0, 2);
  return [
    { ...purpose, question: PURPOSE_QUESTION[language], role: 'purpose' },
    ...unique.map((question) => ({
      id: createRecordId('prompt'),
      question,
      answer: '',
      role: 'ai' as const,
    })),
  ];
};
