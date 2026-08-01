export type AppView = 'map' | 'calendar' | 'chat' | 'settings';

export type EmotionKey =
  | 'calm'
  | 'joy'
  | 'tender'
  | 'curious'
  | 'energized'
  | 'connected'
  | 'heavy'
  | 'restless'
  | 'focused'
  | 'overwhelmed'
  | 'numb'
  | 'mixed';

export type EmotionDefinition = {
  key: EmotionKey;
  label: string;
  shortLabel: string;
  color: string;
  softColor: string;
  description: string;
  score: number;
};

export type PromptRole = 'purpose' | 'ai' | 'fallback' | 'legacy';
export type TitleSource = 'user' | 'ai' | 'fallback';
export type EventTimeSource =
  | 'user'
  | 'device-created'
  | 'photo-exif'
  | 'health-sample'
  | 'legacy';

export type EmotionMoment = {
  id: string;
  emotion: EmotionKey | null;
  intensity: number;
  place: string;
  date: string;
  time: string;
  longitude: number;
  latitude: number;
  noteId: string;
  placeRating: PlaceRating | null;
  color?: string;
  tagGroupId?: number;
  tagOrder?: number;
  isNew?: boolean;
  isInboxDraft?: boolean;
  heartRate?: number;
  source?: 'manual' | 'current-location' | 'photo' | 'inbox';
  eventTimeSource?: EventTimeSource;
  photoTakenAt?: string;
  photoTakenAtKind?: 'local' | 'offset';
  photoTakenAtSource?: 'DateTimeOriginal' | 'CreateDate';
  importedAt?: string;
};

export type PlaceRating =
  | 'safe'
  | 'comfortable'
  | 'neutral'
  | 'uneasy'
  | 'distressing';

export type GuidedAnswer = {
  id: string;
  question: string;
  answer: string;
  role?: PromptRole;
};

export type EmotionNote = {
  id: string;
  title: string;
  titleSource?: TitleSource;
  place: string;
  date: string;
  time: string;
  emotion: EmotionKey | null;
  color?: string;
  placeRating: PlaceRating | null;
  answers: GuidedAnswer[];
  excerpt: string;
  isDraft?: boolean;
  followUpEnabled?: boolean;
};

export type ChatRole = 'user' | 'assistant';

export type ChatOption = {
  id: string;
  label: string;
  responseKind:
    | 'positive'
    | 'calm'
    | 'stronger'
    | 'different'
    | 'unchanged'
    | 'skip';
};

export type FollowUpStatus = 'queued' | 'active' | 'answered' | 'skipped';

export type FollowUpRecord = {
  id: string;
  noteId: string;
  intervalDays: 1 | 3 | 7;
  dueAt: string;
  status: FollowUpStatus;
  prompt: string;
  promptedAt?: string;
  response?: string;
  responseKind?: ChatOption['responseKind'];
  answeredVia?: 'chat' | 'inbox';
  answeredAt?: string;
  assistantReply?: string;
  seenAt?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  body: string;
  noteIds?: string[];
  options?: ChatOption[];
  followUpId?: string;
  createdAt?: string;
};

export type Conversation = {
  id: string;
  title: string;
  preview: string;
  badge?: string;
  unread?: boolean;
  proactive?: boolean;
  kind?: 'companion' | 'regular';
  messages: ChatMessage[];
};

export type RevisitRecord = {
  id: string;
  noteId: string;
  originalEmotion: EmotionKey | null;
  revisitedEmotion: EmotionKey;
  originalOccurredAt: string;
  revisitedAt: string;
  sourceFollowUpId?: string;
};

export type StarInboxStatus =
  | 'pending'
  | 'draft_created'
  | 'completed'
  | 'dismissed';

export type StarInboxItem = {
  id: string;
  source: 'heart-rate';
  sourceEventId: string;
  eventAt: string;
  receivedAt: string;
  heartRate: number;
  latitude?: number;
  longitude?: number;
  locationCapturedAt?: string;
  locationAccuracyMeters?: number;
  linkedMomentId?: string;
  status: StarInboxStatus;
  seenAt?: string;
  confirmedAt?: string;
};

export type HealthPreferences = {
  restingHeartRateMin: number;
  restingHeartRateMax: number;
};

export type ThemeTone = 'original' | 'terracotta' | 'blue' | 'mauve';

export type ThemePalette = {
  page: string;
  card: string;
  icon: string;
  dark: string;
};

export type LocalSettings = {
  avatarSrc: string;
  profileId: string;
  profileName: string;
  language: import('./i18n').AppLanguage;
  aboutMe: string;
  aiToneTags: string[];
  chatPreferenceTags: string[];
};

export type DataMode = 'real' | 'demo';

export type AppDataSnapshot = {
  schemaVersion: number;
  dataMode: DataMode;
  moments: EmotionMoment[];
  notes: EmotionNote[];
  conversations: Conversation[];
  followUps: FollowUpRecord[];
  revisits: RevisitRecord[];
  starInboxItems: StarInboxItem[];
  themeTone: ThemeTone;
  themePalette: ThemePalette;
};
