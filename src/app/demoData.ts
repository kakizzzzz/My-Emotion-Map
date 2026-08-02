import type {
  AppDataSnapshot,
  Conversation,
  EmotionMoment,
  EmotionNote,
  FollowUpRecord,
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
      title: '走过一段安静的路', place: '示范地图 · 步行记录', time: '10:20',
      longitude: 121.4739, latitude: 31.2308,
      excerpt: 'Today was simple and quiet. I walked for a while.',
    },
    {
      title: '留下一张照片', place: '示范地图 · 照片记录', time: '15:10',
      longitude: 121.4744, latitude: 31.2312,
      excerpt: 'I took one photo during the walk.',
    },
    {
      title: '保存这一小段记录', place: '示范地图 · 文字记录', time: '18:05',
      longitude: 121.475, latitude: 31.2315,
      excerpt: 'I saved this small note.',
    },
  ];
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
    emotion: null,
    placeRating: null,
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
    emotion: null,
    intensity: 0,
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
    placeRating: null,
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
          body: '它们来自 My Life Memory 的公开示范星星与示范文字，不含真实账号数据。',
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
