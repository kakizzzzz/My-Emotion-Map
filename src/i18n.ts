import { createContext, useContext } from 'react';

export type AppLanguage = 'zh' | 'en' | 'ko';

export const DEFAULT_LANGUAGE: AppLanguage = 'zh';

export const LANGUAGE_OPTIONS: ReadonlyArray<{
  value: AppLanguage;
  label: string;
}> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
];

export const LANGUAGE_LOCALES: Record<AppLanguage, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ko: 'ko-KR',
};

export const LANGUAGE_HTML_LANGS: Record<AppLanguage, string> = {
  zh: 'zh-CN',
  en: 'en',
  ko: 'ko',
};

export const LANGUAGE_SPEECH_LOCALES: Record<AppLanguage, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ko: 'ko-KR',
};

export const MULTILINGUAL_FONT_FAMILY =
  '"Afacad", "Noto Serif SC", "Noto Serif KR", "Songti SC", "Apple SD Gothic Neo", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// Keep this available for the few large labels that need optical adjustment.
// Do not scale all body text or touch controls with it.
export const LANGUAGE_DISPLAY_SCALE: Record<AppLanguage, number> = {
  zh: 0.9,
  en: 1,
  ko: 0.9,
};

import { zhCopy } from './i18n/zh';
import { enCopy } from './i18n/en';
import { koCopy } from './i18n/ko';

type CopyShape<T> = {
  [Key in keyof T]: T[Key] extends (...args: infer Args) => unknown
    ? (...args: Args) => string
    : T[Key] extends readonly string[]
      ? readonly string[]
      : T[Key] extends object
        ? CopyShape<T[Key]>
        : string;
};

export type AppCopy = CopyShape<typeof zhCopy>;

export const APP_COPY: Record<AppLanguage, AppCopy> = {
  zh: zhCopy,
  en: enCopy,
  ko: koCopy,
};

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  value === 'zh' || value === 'en' || value === 'ko';

export const getAppCopy = (language: AppLanguage): AppCopy =>
  APP_COPY[language] ?? APP_COPY[DEFAULT_LANGUAGE];

export const getLanguageLocale = (language: AppLanguage): string =>
  LANGUAGE_LOCALES[language] ?? LANGUAGE_LOCALES[DEFAULT_LANGUAGE];

export type AppLanguageContextValue = {
  language: AppLanguage;
  copy: AppCopy;
  locale: string;
  speechLocale: string;
  setLanguage: (language: AppLanguage) => void;
};

export const AppLanguageContext =
  createContext<AppLanguageContextValue | null>(null);

export const useAppLanguage = (): AppLanguageContextValue => {
  const value = useContext(AppLanguageContext);
  if (!value) {
    throw new Error('useAppLanguage must be used inside AppLanguageContext.Provider');
  }
  return value;
};
