import type { Decorator, Preview } from '@storybook/react-vite';
import { useEffect, type ReactNode } from 'react';

import { SUPPORTED_LOCALES, type Locale } from '@/i18n';
import { I18nProvider } from '@/i18n/I18nProvider';
import { useUiStore } from '@/stores/uiStore';
import '@/styles/globals.css';

function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    useUiStore.getState().setLocale(locale);
  }, [locale]);
  return (
    <I18nProvider>
      <div className="bg-background p-6 text-foreground">{children}</div>
    </I18nProvider>
  );
}

const withProviders: Decorator = (Story, context) => (
  <Providers locale={context.globals.locale as Locale}>
    <Story />
  </Providers>
);

const preview: Preview = {
  globalTypes: {
    locale: {
      description: 'Interface language',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: [...SUPPORTED_LOCALES],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: 'en' },
  decorators: [withProviders],
  parameters: {
    layout: 'fullscreen',
    // Violations fail the story (WCAG 2.2 AA is a release gate, design-system.md).
    a11y: { test: 'error' },
  },
};

export default preview;
