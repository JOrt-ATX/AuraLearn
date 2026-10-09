import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

export const SUPPORTED_LOCALES = ['en', 'es', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type Messages = typeof en;

export const MESSAGES: Record<Locale, Messages> = { en, es, fr };

declare module 'use-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Pick the first supported interface language from the browser's preference list.
 * The result is not stored in the browser (HR1); phase 2 loads it from the user's profile.
 */
export function detectLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0] ?? '';
    if (isLocale(base)) return base;
  }
  return 'en';
}
