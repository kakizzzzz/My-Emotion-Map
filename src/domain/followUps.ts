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
    id: 'lighter',
    label: '轻了',
    responseKind: 'lighter',
  },
  {
    id: 'stronger',
    label: '更强',
    responseKind: 'stronger',
  },
  {
    id: 'different',
    label: '变了',
    responseKind: 'different',
  },
  {
    id: 'same',
    label: '一样',
    responseKind: 'same',
  },
  {
    id: 'skip',
    label: '跳过',
    responseKind: 'skip',
  },
];

export const getFollowUpOptions = (
  language: AppLanguage,
): ChatOption[] => {
  if (language === 'en') {
    return [
      {
        id: 'lighter',
        label: 'Lighter',
        responseKind: 'lighter',
      },
      {
        id: 'stronger',
        label: 'Stronger',
        responseKind: 'stronger',
      },
      {
        id: 'different',
        label: 'Changed',
        responseKind: 'different',
      },
      {
        id: 'same',
        label: 'Same',
        responseKind: 'same',
      },
      {
        id: 'skip',
        label: 'Skip',
        responseKind: 'skip',
      },
    ];
  }
  if (language === 'ko') {
    return [
      {
        id: 'lighter',
        label: '가벼워짐',
        responseKind: 'lighter',
      },
      {
        id: 'stronger',
        label: '더 강함',
        responseKind: 'stronger',
      },
      {
        id: 'different',
        label: '달라짐',
        responseKind: 'different',
      },
      { id: 'same', label: '같음', responseKind: 'same' },
      {
        id: 'skip',
        label: '건너뛰기',
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

export const getFollowUpPrompt = (
  record: Pick<FollowUpRecord, 'intervalDays'>,
  note: Pick<EmotionNote, 'title'>,
  language: AppLanguage,
) => {
  if (language === 'en') {
    return `Looking back at “${note.title}”, has the feeling changed?`;
  }
  if (language === 'ko') {
    return `“${note.title}”을 다시 보면 느낌이 달라졌나요?`;
  }
  return `现在回看“${note.title}”，感觉有变化吗？`;
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
  _language: AppLanguage,
  intervalDays: 1 | 3 | 7 = 3,
  consentedAt = new Date(),
): FollowUpRecord => {
  const baseTime = consentedAt.getTime();
  const dueAt = new Date(
    baseTime + intervalDays * 24 * 60 * 60 * 1_000,
  ).toISOString();
  return {
    id: createRecordId('follow-up'),
    noteId: note.id,
    intervalDays,
    followUpConsentedAt: consentedAt.toISOString(),
    dueAt,
    status: 'queued',
    promptVersion: 2,
  };
};
