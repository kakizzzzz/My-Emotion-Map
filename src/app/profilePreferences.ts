import type { LocalSettings } from '../types';
import type { AppLanguage } from '../i18n';
import { isSupabaseProfileId } from '../domain/profileIdentity';
import {
  DEVICE_PREFERENCES_STORAGE_KEY,
  userPreferencesStorageKey,
} from './workspace/workspaceStorage';

export const LOCAL_SETTINGS_STORAGE_KEY =
  'my-emotion-map.local-settings.v1';

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  avatarSrc: '',
  profileId: '',
  profileName: '',
  language: 'zh',
  aboutMe: '',
  aiToneTags: [],
  chatPreferenceTags: [],
};

export const createDefaultLocalSettings = (): LocalSettings => ({
  ...DEFAULT_LOCAL_SETTINGS,
  aiToneTags: [],
  chatPreferenceTags: [],
});

const AI_TONE_TAG_ALIASES: Record<string, string> = {
  客观: 'objective',
  温和: 'gentle',
  直接: 'direct',
  简洁: 'concise',
  有耐心: 'patient',
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
        typeof parsed.avatarSrc === 'string' ? parsed.avatarSrc.slice(0, 2_000_000) : '',
      profileId: isSupabaseProfileId(parsed.profileId)
        ? parsed.profileId
        : defaults.profileId,
      profileName: storedProfileName || defaults.profileName,
      language: isLanguage(device.language) ? device.language : 'zh',
      aboutMe:
        typeof parsed.aboutMe === 'string' ? parsed.aboutMe.slice(0, 2_000) : '',
      aiToneTags: Array.isArray(parsed.aiToneTags)
        ? parsed.aiToneTags
            .filter((item): item is string => typeof item === 'string')
            .map((item) => AI_TONE_TAG_ALIASES[item] ?? item)
            .slice(0, 20)
        : [],
      chatPreferenceTags: Array.isArray(parsed.chatPreferenceTags)
        ? parsed.chatPreferenceTags
            .filter((item): item is string => typeof item === 'string')
            .map((item) => COMMUNICATION_TAG_ALIASES[item] ?? item)
            .slice(0, 20)
        : [],
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
