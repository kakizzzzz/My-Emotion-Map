import type { LocalSettings } from '../types';
import type { AppLanguage } from '../i18n';
import { isSupabaseProfileId } from '../domain/profileIdentity';
import {
  DEVICE_PREFERENCES_STORAGE_KEY,
  userPreferencesStorageKey,
} from './workspace/workspaceStorage';
import {
  DEFAULT_FOLLOW_UP_CURVE,
  normalizeFollowUpCurve,
} from '../domain/followUps';

export const LOCAL_SETTINGS_STORAGE_KEY =
  'my-emotion-map.local-settings.v1';
export const ACCOUNT_PREFERENCES_CHANGED_EVENT =
  'my-emotion-map:account-preferences-changed';

export const DEFAULT_AI_CONTEXT_MESSAGE_COUNT = 8;
export const MIN_AI_CONTEXT_MESSAGE_COUNT = 2;
export const MAX_AI_CONTEXT_MESSAGE_COUNT = 20;
export const MAX_AVATAR_DATA_URL_LENGTH = 165_000;

export const normalizeAvatarSrc = (value: unknown) => {
  if (typeof value !== 'string' || value.length > MAX_AVATAR_DATA_URL_LENGTH) {
    return '';
  }
  if (!value) return '';
  return /^data:image\/(?:webp|png|jpeg);base64,/i.test(value) ? value : '';
};

export const normalizeAiContextMessageCount = (value: unknown) => {
  const count = Number(value);
  if (!Number.isFinite(count)) return DEFAULT_AI_CONTEXT_MESSAGE_COUNT;
  return Math.max(
    MIN_AI_CONTEXT_MESSAGE_COUNT,
    Math.min(MAX_AI_CONTEXT_MESSAGE_COUNT, Math.round(count)),
  );
};

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  avatarSrc: '',
  profileId: '',
  profileName: '',
  language: 'zh',
  aboutMe: '',
  aiUserPrompt: '',
  aiContextMessageCount: DEFAULT_AI_CONTEXT_MESSAGE_COUNT,
  chatPreferenceTags: [],
  followUpIntervals: [...DEFAULT_FOLLOW_UP_CURVE],
};

export const createDefaultLocalSettings = (): LocalSettings => ({
  ...DEFAULT_LOCAL_SETTINGS,
  aiUserPrompt: '',
  aiContextMessageCount: DEFAULT_AI_CONTEXT_MESSAGE_COUNT,
  chatPreferenceTags: [],
  followUpIntervals: [...DEFAULT_FOLLOW_UP_CURVE],
});

const DEFAULT_PROFILE_NAME_PREFIX: Record<AppLanguage, string> = {
  zh: '用户',
  en: 'User ',
  ko: '사용자 ',
};

export const buildDefaultProfileName = (
  account: string,
  language: AppLanguage,
) => {
  const normalizedAccount = account.trim().toLocaleLowerCase();
  const prefix = DEFAULT_PROFILE_NAME_PREFIX[language];
  return normalizedAccount ? `${prefix}${normalizedAccount}` : prefix.trim();
};

const COMMUNICATION_TAG_ALIASES: Record<string, string> = {
  先听后建议: 'listenFirst',
  少用反问: 'fewerQuestions',
  提醒具体一点: 'concreteReminders',
  回复短一些: 'shorterReplies',
};

const isLanguage = (value: unknown): value is AppLanguage =>
  value === 'zh' || value === 'en' || value === 'ko';

export const loadLocalSettings = (userId: string | null = null): LocalSettings => {
  const defaults = createDefaultLocalSettings();
  try {
    const deviceStored = window.localStorage.getItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
    );
    const device = deviceStored
      ? (JSON.parse(deviceStored) as Partial<LocalSettings>)
      : {};
    const stored = userId
      ? window.localStorage.getItem(userPreferencesStorageKey(userId))
      : null;
    const parsed = stored ? (JSON.parse(stored) as Partial<LocalSettings>) : {};
    const storedProfileName =
      typeof parsed.profileName === 'string'
        ? parsed.profileName.trim().slice(0, 80)
        : '';
    return {
      avatarSrc:
        normalizeAvatarSrc(parsed.avatarSrc),
      profileId: isSupabaseProfileId(parsed.profileId)
        ? parsed.profileId
        : defaults.profileId,
      profileName: storedProfileName || defaults.profileName,
      language: isLanguage(device.language) ? device.language : 'zh',
      aboutMe:
        typeof parsed.aboutMe === 'string' ? parsed.aboutMe.slice(0, 2_000) : '',
      aiUserPrompt:
        typeof parsed.aiUserPrompt === 'string'
          ? parsed.aiUserPrompt.trim().slice(0, 500)
          : '',
      aiContextMessageCount: normalizeAiContextMessageCount(
        parsed.aiContextMessageCount,
      ),
      chatPreferenceTags: Array.isArray(parsed.chatPreferenceTags)
        ? parsed.chatPreferenceTags
            .filter((item): item is string => typeof item === 'string')
            .map((item) => COMMUNICATION_TAG_ALIASES[item] ?? item)
            .slice(0, 20)
        : [],
      followUpIntervals: normalizeFollowUpCurve(parsed.followUpIntervals),
    };
  } catch {
    return defaults;
  }
};

export const saveLocalSettings = (
  settings: LocalSettings,
  userId: string | null = null,
) => {
  try {
    window.localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ language: settings.language }),
    );
    if (userId) {
      window.localStorage.setItem(
        userPreferencesStorageKey(userId),
        JSON.stringify(settings),
      );
      window.dispatchEvent(new CustomEvent(ACCOUNT_PREFERENCES_CHANGED_EVENT, {
        detail: { userId },
      }));
    }
    return true;
  } catch {
    return false;
  }
};

export const createAvatarDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      try {
        const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = (image.naturalWidth - cropSize) / 2;
        const sourceY = (image.naturalHeight - cropSize) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = 192;
        canvas.height = 192;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable');
        context.drawImage(
          image,
          sourceX,
          sourceY,
          cropSize,
          cropSize,
          0,
          0,
          192,
          192,
        );
        let quality = 0.82;
        let result = canvas.toDataURL('image/webp', quality);
        while (result.length > 160_000 && quality > 0.45) {
          quality -= 0.08;
          result = canvas.toDataURL('image/webp', quality);
        }
        if (result.length > 165_000) {
          throw new Error('Avatar exceeds the local storage budget');
        }
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to read image'));
    };
    image.src = objectUrl;
  });
