import type { AppLanguage } from '../../i18n';
import type { EmotionNote } from '../../types';
import type { EmotionChatResult, PublicEvidence } from '../../services/emotionChat';

type DemoPrompt = {
  intent: 'lookup' | 'comparison' | 'pattern';
  text: string;
};

export const DEMO_SUGGESTED_PROMPTS: Record<AppLanguage, DemoPrompt[]> = {
  zh: [
    { intent: 'lookup', text: '图书馆的记录是什么？' },
    { intent: 'lookup', text: '哪条记录发生在户外？' },
    { intent: 'lookup', text: '食堂那条星星写了什么？' },
    { intent: 'comparison', text: '上午和下午的记录有什么不同？' },
    { intent: 'comparison', text: '图书馆和广场的记录有什么不同？' },
    { intent: 'pattern', text: '这些记录里有什么重复现象？' },
    { intent: 'pattern', text: '哪些地点出现了专注或平静？' },
    { intent: 'pattern', text: '这一天的记录大致怎么展开？' },
  ],
  en: [
    { intent: 'lookup', text: 'What happened at the library?' },
    { intent: 'lookup', text: 'Which record happened outdoors?' },
    { intent: 'lookup', text: 'What does the cafeteria star say?' },
    { intent: 'comparison', text: 'How do morning and afternoon differ?' },
    { intent: 'comparison', text: 'Compare the library and plaza records.' },
    { intent: 'pattern', text: 'What repeats across these records?' },
    { intent: 'pattern', text: 'Where do focus or calm appear?' },
    { intent: 'pattern', text: 'How does the campus day unfold?' },
  ],
  ko: [
    { intent: 'lookup', text: '도서관 기록은 무엇인가요?' },
    { intent: 'lookup', text: '야외에서 남긴 기록은 무엇인가요?' },
    { intent: 'lookup', text: '학생식당 별에는 무엇이 적혀 있나요?' },
    { intent: 'comparison', text: '오전과 오후 기록은 어떻게 다른가요?' },
    { intent: 'comparison', text: '도서관과 광장 기록을 비교해 주세요.' },
    { intent: 'pattern', text: '기록에서 반복되는 점은 무엇인가요?' },
    { intent: 'pattern', text: '집중이나 평온은 어디에서 보이나요?' },
    { intent: 'pattern', text: '캠퍼스 하루는 어떻게 이어지나요?' },
  ],
};

const isDemoNote = (note: EmotionNote) =>
  note.id.startsWith('demo:synthetic:campus-day:note:');

const evidenceFor = (
  note: EmotionNote,
  matchReason: string,
): PublicEvidence => ({
  noteId: note.id,
  title: note.title,
  date: note.date,
  place: note.place,
  matchReason,
});

const classifyIntent = (message: string): DemoPrompt['intent'] => {
  const lower = message.toLocaleLowerCase();
  if (/比较|不同|上午.*下午|compare|differ|비교|다른/.test(lower)) {
    return 'comparison';
  }
  if (/重复|规律|共同|哪些地点|大致|pattern|repeat|where do|unfold|반복|어디|이어/.test(lower)) {
    return 'pattern';
  }
  return 'lookup';
};

const localized = (language: AppLanguage) => ({
  label: language === 'zh' ? '演示回答' : language === 'ko' ? '데모 답변' : 'Demo answer',
  lookup: language === 'zh'
    ? '我只查看了下方这条合成示范记录。'
    : language === 'ko'
      ? '아래의 합성 데모 기록만 확인했습니다.'
      : 'I only checked the synthetic Demo record below.',
  comparison: language === 'zh'
    ? '上午的记录更偏向课程准备，下午的记录更多是课后整理与停留。这里只是在比较明确写下的活动。'
    : language === 'ko'
      ? '오전 기록은 수업 준비, 오후 기록은 수업 뒤 정리와 머무름이 중심입니다. 기록에 명시된 활동만 비교했습니다.'
      : 'The morning records center on class preparation; the afternoon records center on reviewing and pausing after class. This compares only explicit activities.',
  pattern: language === 'zh'
    ? '这些合成记录重复出现了短暂整理、校园内移动和课间停留；它们不能说明长期状态。'
    : language === 'ko'
      ? '합성 기록에는 짧은 정리, 캠퍼스 이동, 수업 사이 머무름이 반복됩니다. 장기 상태를 뜻하지는 않습니다.'
      : 'The synthetic records repeat short planning, campus movement, and pauses between classes. They do not establish a long-term state.',
});

export const createDemoChatResponse = ({
  message,
  language,
  notes,
}: {
  message: string;
  language: AppLanguage;
  notes: EmotionNote[];
}): EmotionChatResult => {
  const demoNotes = notes.filter(isDemoNote).slice(0, 6);
  const intent = classifyIntent(message);
  const copy = localized(language);
  const matching = intent === 'lookup'
    ? demoNotes.filter((note) => {
        const haystack = `${note.title} ${note.place} ${note.excerpt}`.toLocaleLowerCase();
        const terms = message.toLocaleLowerCase().split(/\s+|的|是|什么|哪条|记录|what|which|the/)
          .filter((term) => term.length > 1);
        return terms.some((term) => haystack.includes(term));
      }).slice(0, 2)
    : demoNotes.slice(0, intent === 'comparison' ? 4 : 5);
  const selected = matching.length ? matching : demoNotes.slice(0, 1);
  const answerBody = intent === 'lookup'
    ? selected[0]
      ? `${copy.lookup}\n${selected[0].title}：${selected[0].excerpt}`
      : copy.lookup
    : copy[intent];
  return {
    intent,
    retrievalStatus: selected.length ? 'supported' : 'not_found',
    status: selected.length ? 'supported' : 'not_found',
    answer: `${copy.label}\n${answerBody}`,
    evidence: selected.map((note) => evidenceFor(
      note,
      language === 'zh' ? '合成示范记录' : language === 'ko' ? '합성 데모 기록' : 'Synthetic Demo record',
    )),
    externalEvidence: [],
    confidence: selected.length ? 'high' : 'none',
    limitations: [
      language === 'zh'
        ? '仅使用当前 Demo 内的合成记录。'
        : language === 'ko'
          ? '현재 Demo의 합성 기록만 사용했습니다.'
          : 'Uses only synthetic records in the current Demo.',
    ],
  };
};
