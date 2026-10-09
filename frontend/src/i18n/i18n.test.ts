import { describe, expect, it } from 'vitest';

import { detectLocale, MESSAGES, SUPPORTED_LOCALES } from '@/i18n';
import { humanize, humanizeList } from '@/i18n/humanize';

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (typeof value !== 'object' || value === null) throw new Error(`Invalid message at ${prefix}`);
  return Object.entries(value).reduce<Record<string, string>>(
    (all, [key, child]) => ({ ...all, ...flatten(child, prefix ? `${prefix}.${key}` : key) }),
    {},
  );
}

const flat = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, flatten(MESSAGES[locale])]),
);
const placeholders = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).sort();

describe('catalogues (HR15)', () => {
  it.each(SUPPORTED_LOCALES)('%s has exactly the same keys as English', (locale) => {
    expect(Object.keys(flat[locale] ?? {}).sort()).toEqual(Object.keys(flat.en ?? {}).sort());
  });

  it.each(SUPPORTED_LOCALES)('%s has no empty message', (locale) => {
    for (const [key, text] of Object.entries(flat[locale] ?? {})) {
      expect(text.trim(), key).not.toBe('');
    }
  });

  it('keeps the same interpolation placeholders in every language', () => {
    for (const [key, text] of Object.entries(flat.en ?? {})) {
      for (const locale of SUPPORTED_LOCALES) {
        expect(placeholders(flat[locale]?.[key] ?? ''), `${locale}:${key}`).toEqual(
          placeholders(text),
        );
      }
    }
  });

  it('never shows an error code as the message (HR21)', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, text] of Object.entries(flat[locale] ?? {})) {
        if (key.startsWith('errors.')) expect(text, `${locale}:${key}`).not.toMatch(/^[a-z_]+$/);
      }
    }
  });
});

describe('detectLocale', () => {
  it('picks the first supported language', () => {
    expect(detectLocale(['de-DE', 'fr-CA', 'es'])).toBe('fr');
    expect(detectLocale(['ES-es'])).toBe('es');
  });
  it('falls back to English', () => {
    expect(detectLocale([])).toBe('en');
    expect(detectLocale(['ja', 'zh-CN'])).toBe('en');
  });
});

describe('humanize (HR21)', () => {
  it.each([
    ['in_review', 'In Review'],
    ['pending-approval', 'Pending Approval'],
    ['plain_user', 'Plain User'],
    ['superAdmin', 'Super Admin'],
    ['course.status.draft', 'Course Status Draft'],
    ['__x__', 'X'],
    ['', ''],
  ])('%s -> %s', (token, expected) => {
    expect(humanize(token)).toBe(expected);
  });

  it('joins lists the way each language reads', () => {
    expect(humanizeList(['draft', 'in_review', 'published'], 'en')).toBe(
      'Draft, In Review, and Published',
    );
    expect(humanizeList(['draft', 'published'], 'es')).toBe('Draft y Published');
    expect(humanizeList(['draft', 'published'], 'fr')).toBe('Draft et Published');
  });
});
