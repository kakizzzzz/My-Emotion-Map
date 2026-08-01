import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import {
  AppLanguageContext,
  LANGUAGE_SPEECH_LOCALES,
  getAppCopy,
  getLanguageLocale,
  type AppLanguage,
} from '../src/i18n';

export function renderWithLanguage(
  node: ReactNode,
  language: AppLanguage = 'zh',
) {
  return render(
    <AppLanguageContext.Provider
      value={{
        language,
        copy: getAppCopy(language),
        locale: getLanguageLocale(language),
        speechLocale: LANGUAGE_SPEECH_LOCALES[language],
        setLanguage: () => undefined,
      }}
    >
      {node}
    </AppLanguageContext.Provider>,
  );
}
