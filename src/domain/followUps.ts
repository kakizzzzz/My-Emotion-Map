import type {
  ChatOption,
  EmotionNote,
  FollowUpRecord,
} from '../types';
import type { AppLanguage } from '../i18n';
import { createRecordId } from '../app/createRecordId';

export const FOLLOW_UP_CONVERSATION_ID = 'thread-revisit';

const FOLLOW_UP_OPTIONS: ChatOption[] = [
  {
    id: 'better',
    label: '现在回看，感受轻了一些。',
    responseKind: 'calm',
  },
  {
    id: 'more-intense',
    label: '现在回看，感受更强烈了。',
    responseKind: 'stronger',
  },
  {
    id: 'different',
    label: '感受有变化，但我还说不清。',
    responseKind: 'different',
  },
  {
    id: 'same',
    label: '和当时差不多。',
    responseKind: 'unchanged',
  },
  {
    id: 'skip',
    label: '我暂时不想回看。',
    responseKind: 'skip',
  },
];

export const getFollowUpOptions = (
  language: AppLanguage,
): ChatOption[] => {
  if (language === 'en') {
    return [
      {
        id: 'better',
        label: 'It feels a little lighter now.',
        responseKind: 'calm',
      },
      {
        id: 'more-intense',
        label: 'It feels more intense now.',
        responseKind: 'stronger',
      },
      {
        id: 'different',
        label: 'It has changed, but I cannot describe it yet.',
        responseKind: 'different',
      },
      {
        id: 'same',
        label: 'It feels about the same.',
        responseKind: 'unchanged',
      },
      {
        id: 'skip',
        label: 'I do not want to revisit it now.',
        responseKind: 'skip',
      },
    ];
  }
  if (language === 'ko') {
    return [
      {
        id: 'better',
        label: '지금은 조금 가볍게 느껴져요.',
        responseKind: 'calm',
      },
      {
        id: 'more-intense',
        label: '지금은 감정이 더 강해졌어요.',
        responseKind: 'stronger',
      },
      {
        id: 'different',
        label: '달라졌지만 아직 설명하기 어려워요.',
        responseKind: 'different',
      },
      { id: 'same', label: '그때와 비슷해요.', responseKind: 'unchanged' },
      {
        id: 'skip',
        label: '지금은 돌아보고 싶지 않아요.',
        responseKind: 'skip',
      },
    ];
  }
  return FOLLOW_UP_OPTIONS;
};

export const getFollowUpAssistantReply = (
  kind: ChatOption['responseKind'],
  language: AppLanguage,
) => {
  if (language === 'en') {
    if (kind === 'skip') {
      return 'Okay. This follow-up was skipped and the original record is unchanged.';
    }
    return 'Your follow-up answer was saved without changing the original feeling.';
  }
  if (language === 'ko') {
    if (kind === 'skip') {
      return '알겠어요. 이번 후속 확인은 건너뛰었고 원래 기록은 그대로예요.';
    }
    return '원래 감정을 바꾸지 않고 후속 답변을 저장했어요.';
  }
  if (kind === 'skip') {
    return '好，这次先不回看；原始记录没有改变。';
  }
  return '这次回看已经追加保存，原始情绪没有被覆盖。';
};

export const formatFollowUpTimestamp = (
  value: string,
  locale: string,
) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(parsed)
    .replace(/\//g, '-');
};

export const promoteNextDueFollowUp = (
  records: FollowUpRecord[],
  now = new Date(),
): FollowUpRecord[] => {
  const nowTime = now.getTime();
  const normalized = records.map((record) => {
    if (
      record.status === 'active' &&
      new Date(record.dueAt).getTime() > nowTime
    ) {
      return { ...record, status: 'queued' as const, promptedAt: undefined };
    }
    return record;
  });
  const active = normalized
    .filter((record) => record.status === 'active')
    .sort(
      (left, right) =>
        new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),
    );
  if (active.length) {
    const keepId = active[0].id;
    return normalized.map((record) =>
      record.status === 'active' && record.id !== keepId
        ? { ...record, status: 'queued' as const, promptedAt: undefined }
        : record,
    );
  }
  const next = normalized
    .filter(
      (record) =>
        record.status === 'queued' &&
        new Date(record.dueAt).getTime() <= nowTime,
    )
    .sort(
      (left, right) =>
        new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),
    )[0];
  if (!next) return normalized;
  const promptedAt = now.toISOString();
  return normalized.map((record) =>
    record.id === next.id
      ? { ...record, status: 'active' as const, promptedAt }
      : record,
  );
};

export const createFollowUpForNote = (
  note: EmotionNote,
  language: AppLanguage,
  intervalDays: 1 | 3 | 7 = 3,
): FollowUpRecord => {
  const occurredAt = new Date(`${note.date}T${note.time}:00`);
  const baseTime = Number.isNaN(occurredAt.getTime())
    ? Date.now()
    : occurredAt.getTime();
  const dueAt = new Date(
    baseTime + intervalDays * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const prompt =
    language === 'en'
      ? `You chose a follow-up for “${note.title}”. How does it feel now?`
      : language === 'ko'
        ? `“${note.title}” 기록을 다시 확인하기로 했어요. 지금은 어떻게 느껴지나요?`
        : `你为“${note.title}”开启了回访。现在回看，这段经历给你的感觉有变化吗？`;
  return {
    id: createRecordId('follow-up'),
    noteId: note.id,
    intervalDays,
    dueAt,
    status: 'queued',
    prompt,
  };
};
