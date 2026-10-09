import { useEffect, type ReactNode } from 'react';
import { IntlProvider } from 'use-intl';

import { humanize } from './humanize';
import { MESSAGES } from '.';
import { useUiStore } from '@/stores/uiStore';

interface I18nProviderProps {
  children: ReactNode;
}

/** Provides the active locale's messages and keeps <html lang> in sync (WCAG 3.1.1). */
export function I18nProvider({ children }: I18nProviderProps): ReactNode {
  const locale = useUiStore((state) => state.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <IntlProvider
      locale={locale}
      messages={MESSAGES[locale]}
      // Never show a technical key to the user (HR21), even if a translation is missing.
      getMessageFallback={({ key }) => humanize(key.split('.').pop() ?? key, locale)}
      onError={() => undefined}
    >
      {children}
    </IntlProvider>
  );
}
