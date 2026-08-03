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
  | 'legacy';

export type TimePrecision = 'minute' | 'date' | 'unknown';

export type TemporalFields = {
  occurredAtUtc: string | null;
  localDate: string;
  localTime: string;
  timeZone: string | null;
  utcOffsetMinutes: number | null;
  timePrecision: TimePrecision;
  eventTimeSource: EventTimeSource;
};

export type EmotionMoment = Partial<TemporalFields> & {
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
  source?: 'manual' | 'current-location' | 'photo';
  photoTakenAt?: string;
  photoTakenAtKind?: 'local' | 'offset';
  photoTakenAtSource?: 'DateTimeOriginal' | 'CreateDate';
  importedAt?: string;
  locationCapturedAt?: string;
  locationTimeRelation?: 'event' | 'confirmation' | 'manual';
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

export type EmotionNote = Partial<TemporalFields> & {
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

export type FollowUpOptionId =
  | 'lighter'
  | 'stronger'
  | 'different'
  | 'same'
  | 'skip';

export type LegacyFollowUpResponseKind =
  | 'legacyPositive'
  | 'calm'
  | 'unchanged';

export type ChatOption = {
  id: string;
  label: string;
  responseKind: FollowUpOptionId;
};

export type ChatDeliveryState =
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'stopped';

export type ClarificationOption = {
  optionId: string;
  label: string;
  continuationToken: string;
};

export type FollowUpStatus = 'queued' | 'active' | 'answered' | 'skipped';

export type FollowUpRecord = {
  id: string;
  noteId: string;
  intervalDays: number;
  dueAt: string;
  status: FollowUpStatus;
  followUpConsentedAt?: string;
  promptVersion?: number;
  responseOptionId?: FollowUpOptionId;
  answerCommandId?: string;
  /** Legacy v1-v3 display data, read only during migration. */
  prompt?: string;
  promptedAt?: string;
  response?: string;
  responseKind?: FollowUpOptionId | LegacyFollowUpResponseKind;
  answeredVia?: 'chat' | 'inbox';
  answeredAt?: string;
  assistantReply?: string;
  seenAt?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  body: string;
  kind?:
    | 'message'
    | 'clarification'
    | 'followup_prompt'
    | 'followup_answer'
    | 'followup_reply';
  noteIds?: string[];
  externalEvidence?: ExternalEvidenceReference[];
  mcpCalls?: McpCallReference[];
  options?: ChatOption[];
  clarificationOptions?: ClarificationOption[];
  requestId?: string;
  replyToRequestId?: string;
  deliveryState?: ChatDeliveryState;
  retryable?: boolean;
  referenceConfirmation?: {
    optionId: string;
    continuationToken: string;
  };
  followUpId?: string;
  createdAt?: string;
};

export type ExternalEvidenceReference = {
  referenceId: string;
  title: string;
  date: string;
  place: string;
  matchReason: string;
  source: 'my_life_memory_external';
};

export type McpCallReference = {
  server: 'my_life_memory';
  toolName:
    | 'research_memory_context'
    | 'search_memories'
    | 'list_locations'
    | 'get_location_memory'
    | 'get_day_memory'
    | 'summarize_memory_range'
    | 'get_memory_images'
    | 'get_routes';
  status: 'completed' | 'not_found' | 'unavailable';
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
  changeDirection: Exclude<FollowUpOptionId, 'skip'>;
  currentEmotion?: EmotionKey;
  originalOccurredAt: string;
  revisitedAt: string;
  sourceFollowUpId?: string;
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
  aiUserPrompt: string;
  aiContextMessageCount: number;
  chatPreferenceTags: string[];
  followUpIntervals: number[];
};

export type MapViewport = {
  longitude: number;
  latitude: number;
  zoom: number;
};

export type DataMode = 'real';

export type AppDataSnapshot = {
  schemaVersion: number;
  dataMode: DataMode;
  moments: EmotionMoment[];
  notes: EmotionNote[];
  conversations: Conversation[];
  followUps: FollowUpRecord[];
  revisits: RevisitRecord[];
  themeTone: ThemeTone;
  themePalette: ThemePalette;
  lastConversationId?: string;
  lastViewport?: MapViewport;
};
