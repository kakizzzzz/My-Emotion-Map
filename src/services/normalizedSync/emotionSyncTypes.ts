import type {
  ChatMessage,
  Conversation,
  EmotionMoment,
  EmotionNote,
  FollowUpRecord,
  LocalSettings,
  RevisitRecord,
  ThemePalette,
  ThemeTone,
} from '../../types';

export const NORMALIZED_EMOTION_MODEL_VERSION = 2;
export const NORMALIZED_EMOTION_APP_SCHEMA_VERSION = 6;
export const MAX_EMOTION_MUTATIONS_PER_COMMIT = 500;

export type CloudSyncStatus =
  | 'unconfigured' | 'signed_out' | 'idle' | 'local' | 'checking'
  | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict'
  | 'upgrade_required' | 'setup_required';

export type EmotionMutationType =
  | 'settings_update'
  | 'preferences_update'
  | 'record_upsert'
  | 'record_soft_delete'
  | 'conversation_upsert'
  | 'conversation_soft_delete'
  | 'message_upsert'
  | 'message_soft_delete'
  | 'followup_upsert'
  | 'followup_soft_delete'
  | 'revisit_upsert'
  | 'revisit_soft_delete';

export type EmotionMutation = {
  mutationId: string;
  type: EmotionMutationType;
  entityId: string;
  parentId?: string;
  payload?: Record<string, unknown>;
  base?: Record<string, unknown> | null;
  createdAt: number;
};

export type EmotionWireMutation = Pick<
  EmotionMutation,
  'type' | 'entityId' | 'parentId' | 'payload'
>;

export type EmotionSettingsEntity = {
  schemaVersion: number;
  themeTone: ThemeTone;
  themePalette: ThemePalette;
};

export type EmotionPreferencesEntity = Pick<
  LocalSettings,
  | 'profileName'
  | 'aboutMe'
  | 'aiUserPrompt'
  | 'aiContextMessageCount'
  | 'chatPreferenceTags'
  | 'followUpIntervals'
>;

export type EmotionRecordEntity = {
  momentId: string;
  noteId: string;
  sortOrder: number;
  longitude: number;
  latitude: number;
  place: string;
  emotion: EmotionMoment['emotion'];
  intensity: number;
  placeRating: EmotionMoment['placeRating'];
  color: string | null;
  tagGroupId: number | null;
  tagOrder: number | null;
  localDate: string;
  localTime: string;
  occurredAtUtc: string | null;
  timeZone: string | null;
  utcOffsetMinutes: number | null;
  timePrecision: NonNullable<EmotionMoment['timePrecision']>;
  eventTimeSource: NonNullable<EmotionMoment['eventTimeSource']>;
  source: EmotionMoment['source'] | null;
  photoTakenAt: string | null;
  photoTakenAtKind: EmotionMoment['photoTakenAtKind'] | null;
  photoTakenAtSource: EmotionMoment['photoTakenAtSource'] | null;
  importedAt: string | null;
  locationCapturedAt: string | null;
  locationTimeRelation: EmotionMoment['locationTimeRelation'] | null;
  title: string;
  titleSource: EmotionNote['titleSource'] | null;
  answers: EmotionNote['answers'];
  excerpt: string;
  isDraft: boolean;
  isNew: boolean;
  followUpEnabled: boolean;
};

export type EmotionConversationEntity = Omit<
  Conversation,
  'preview' | 'messages' | 'kind'
> & {
  sortOrder: number;
  kind: 'regular' | 'companion';
};

export type EmotionMessageEntity = ChatMessage & {
  conversationId: string;
  sortOrder: number;
};

export type EmotionFollowUpEntity = FollowUpRecord & {
  sortOrder: number;
};

export type EmotionRevisitEntity = RevisitRecord & {
  sortOrder: number;
};

export type NormalizedEmotionSnapshot = {
  settings: EmotionSettingsEntity;
  preferences: EmotionPreferencesEntity;
  records: EmotionRecordEntity[];
  conversations: EmotionConversationEntity[];
  messages: EmotionMessageEntity[];
  followUps: EmotionFollowUpEntity[];
  revisits: EmotionRevisitEntity[];
};

export type EmotionRecordRecovery = {
  reason:
    | 'duplicate-moment-id'
    | 'duplicate-note-id'
    | 'missing-note'
    | 'missing-moment'
    | 'record-shared-fields-diverged';
  momentId?: string;
  noteId?: string;
  moment?: EmotionMoment;
  note?: EmotionNote;
  canonicalSource?: 'moment' | 'note';
};

export type NormalizedEmotionBuildResult = {
  snapshot: NormalizedEmotionSnapshot;
  issues: string[];
  recovery: EmotionRecordRecovery[];
};
