export type AppView = 'map' | 'calendar' | 'chat' | 'inbox' | 'settings';

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
  isInboxDraft?: boolean;
  heartRate?: number;
  source?: 'manual' | 'current-location' | 'photo' | 'inbox';
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
  intervalDays: 1 | 3 | 7;
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
  locationTimeRelation?: 'event' | 'confirmation' | 'manual';
  verification?: 'verified' | 'unverified' | 'test';
  context?: 'resting' | 'workout' | 'unknown';
  samples?: Array<{ bpm: number; at: string }>;
  lowSignalConfidence?: boolean;
  decisionReason?:
    | 'outside_range'
    | 'outside_range_single_sample'
    | 'post_workout_review'
    | 'unknown_strict_review'
    | 'pending_test'
    | 'outside_resting_range'
    | 'low_signal_review'
    | 'non_resting_review'
    | 'test_event'
    | 'legacy_review';
  thresholdSnapshot?: {
    restingMin: number;
    restingMax: number;
    singleSampleEnabled?: boolean;
    workoutPolicy?: 'suppress' | 'post_workout_review';
    unknownPolicy?: 'suppress' | 'strict_review';
    cooldownMinutes?: number;
  };
  algorithmVersion?: string;
  signalLevel?: 'standard' | 'low';
  repeatCount?: number;
  linkedMomentId?: string;
  status: StarInboxStatus;
  seenAt?: string;
  confirmedAt?: string;
};

export type HealthPreferences = {
  restingHeartRateMin: number;
  restingHeartRateMax: number;
  rangeConfirmed: boolean;
  singleSampleEnabled: boolean;
  workoutPolicy: 'suppress' | 'post_workout_review';
  unknownPolicy: 'suppress' | 'strict_review';
  cooldownMinutes: number;
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
  aiUserPrompt: string;
  chatPreferenceTags: string[];
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
  starInboxItems: StarInboxItem[];
  themeTone: ThemeTone;
  themePalette: ThemePalette;
  lastConversationId?: string;
  lastViewport?: MapViewport;
};
