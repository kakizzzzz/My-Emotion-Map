import type {
  AppDataSnapshot,
  Conversation,
  EmotionKey,
  EmotionMoment,
  EmotionNote,
  FollowUpRecord,
  PlaceRating,
} from '../types';
import { DEFAULT_THEME } from './themePreferences';

const localIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const createDemoAppData = (anchor = new Date()): AppDataSnapshot => {
  const sourceRecordId = 'default-record-star';
  const anchorDate = new Date(
    anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 12,
  );
  const days = [-2, -1, 0].map((offset) => {
    const date = new Date(anchorDate);
    date.setDate(date.getDate() + offset);
    return localIsoDate(date);
  });
  const definitions = [
    {
      title: '图书馆靠窗复习', place: '东国大学中央图书馆', time: '10:20',
      longitude: 126.9994, latitude: 37.5582,
      emotion: 'focused', placeRating: 'safe',
      excerpt: '上午的靠窗位置很安静，我把下午课程的阅读材料整理完了。',
    },
    {
      title: '万海广场的午休', place: '万海广场', time: '12:35',
      longitude: 127.0003, latitude: 37.5579,
      emotion: 'connected', placeRating: 'comfortable',
      excerpt: '和同学吃完午饭，在广场坐了一会儿。',
    },
    {
      title: '惠化馆课后整理', place: '惠化馆走廊', time: '15:10',
      longitude: 127.0008, latitude: 37.5591,
      emotion: 'calm', placeRating: 'safe',
      excerpt: '下课后留在走廊，把小组任务和明天要带的材料记了下来。',
    },
  ] satisfies Array<{
    title: string;
    place: string;
    time: string;
    longitude: number;
    latitude: number;
    emotion: EmotionKey;
    placeRating: PlaceRating;
    excerpt: string;
  }>;
  const notes: EmotionNote[] = definitions.map((definition, index) => ({
    id: `demo:mlm:${sourceRecordId}:note:${index + 1}`,
    title: definition.title,
    titleSource: 'fallback',
    place: definition.place,
    date: days[index],
    time: definition.time,
    localDate: days[index],
    localTime: definition.time,
    occurredAtUtc: null,
    timeZone: null,
    utcOffsetMinutes: null,
    timePrecision: 'minute',
    eventTimeSource: 'legacy',
    emotion: definition.emotion,
    placeRating: definition.placeRating,
    excerpt: definition.excerpt,
    answers: [{
      id: 'purpose', role: 'purpose', question: '你去这做什么？',
      answer: definition.excerpt,
    }],
    followUpEnabled: index === 1,
  }));
  const moments: EmotionMoment[] = definitions.map((definition, index) => ({
    id: `demo:mlm:${sourceRecordId}:moment:${index + 1}`,
    noteId: notes[index].id,
    emotion: definition.emotion,
    intensity: 4,
    place: definition.place,
    date: days[index],
    time: definition.time,
    localDate: days[index],
    localTime: definition.time,
    occurredAtUtc: null,
    timeZone: null,
    utcOffsetMinutes: null,
    timePrecision: 'minute',
    eventTimeSource: 'legacy',
    longitude: definition.longitude,
    latitude: definition.latitude,
    placeRating: definition.placeRating,
  }));
  const followUpId = `demo:mlm:${sourceRecordId}:followup:1`;
  const now = new Date().toISOString();
  const followUps: FollowUpRecord[] = [{
    id: followUpId,
    noteId: notes[1].id,
    intervalDays: 3,
    followUpConsentedAt: now,
    dueAt: now,
    status: 'active',
    promptVersion: 2,
    promptedAt: now,
  }];
  const conversations: Conversation[] = [
    {
      id: 'thread-revisit',
      title: '回访',
      preview: notes[1].title,
      kind: 'companion',
      unread: true,
      messages: [{
        id: `demo:mlm:${sourceRecordId}:message:followup`,
        role: 'assistant',
        kind: 'followup_prompt',
        body: '',
        noteIds: [notes[1].id],
        followUpId,
        createdAt: now,
      }],
    },
    {
      id: `demo:mlm:${sourceRecordId}:conversation:1`,
      title: '这几条记录来自哪里？',
      preview: '只引用了公开示范记录。',
      kind: 'regular',
      messages: [
        {
          id: `demo:mlm:${sourceRecordId}:message:question`, role: 'user',
          body: '这几条记录来自哪里？', createdAt: now,
        },
        {
          id: `demo:mlm:${sourceRecordId}:message:answer`, role: 'assistant',
          body: '它们是东国大学本校的公开演示记录，不含真实账号数据。',
          noteIds: notes.map((note) => note.id), createdAt: now,
        },
      ],
    },
  ];
  return {
    schemaVersion: 4,
    dataMode: 'demo',
    moments,
    notes,
    conversations,
    followUps,
    revisits: [],
    starInboxItems: [],
    themeTone: 'original',
    themePalette: DEFAULT_THEME,
    demoAnchorDate: localIsoDate(anchorDate),
    lastConversationId: conversations[1].id,
  };
};
