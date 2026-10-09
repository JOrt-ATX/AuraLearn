import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { contrast, hexToLinear, oklchToLinear, parseOklch, type Rgb } from './color';

const root = path.resolve(import.meta.dirname, '..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');
const globalsCss = read('src/styles/globals.css');

interface Token {
  $value: string;
  $extensions: { 'com.atexis.hex': string };
}
type TokenFile = Record<string, Token>;

const themes: Record<'light' | 'dark', TokenFile> = {
  light: JSON.parse(read('design/tokens/light.tokens.json')) as TokenFile,
  dark: JSON.parse(read('design/tokens/dark.tokens.json')) as TokenFile,
};

const rgb = (theme: 'light' | 'dark', name: string): Rgb => {
  const token = themes[theme][name];
  if (!token) throw new Error(`Missing token ${theme}:${name}`);
  return oklchToLinear(parseOklch(token.$value));
};

// Foreground text on its surface must reach WCAG 2.2 AA for normal text (4.5:1).
const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['success-foreground', 'success'],
  ['warning-foreground', 'warning'],
  ['info-foreground', 'info'],
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
  ['sidebar-accent-foreground', 'sidebar-accent'],
  // Semantic colours used as text or links on the page background.
  ['primary', 'background'],
  ['destructive', 'background'],
];

// Focus rings and boundaries of controls need 3:1 against the page (WCAG 1.4.11).
const NON_TEXT_PAIRS: [string, string][] = [
  ['ring', 'background'],
  ['sidebar-ring', 'sidebar'],
];

describe.each(['light', 'dark'] as const)('%s tokens', (theme) => {
  it('match the branding.md hex values they were derived from', () => {
    for (const [name, token] of Object.entries(themes[theme])) {
      const expected = hexToLinear(token.$extensions['com.atexis.hex']);
      const actual = oklchToLinear(parseOklch(token.$value));
      actual.forEach((value, index) => {
        expect(value, `${name} channel ${index}`).toBeCloseTo(expected[index] ?? NaN, 2);
      });
    }
  });

  it.each(TEXT_PAIRS)('%s on %s reaches 4.5:1', (foreground, background) => {
    expect(contrast(rgb(theme, foreground), rgb(theme, background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('%s against %s reaches 3:1', (indicator, surface) => {
    expect(contrast(rgb(theme, indicator), rgb(theme, surface))).toBeGreaterThanOrEqual(3);
  });
});

describe('token set', () => {
  it('defines the same names in light and dark', () => {
    expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
  });

  it('uses the ATEXIS blue as the light primary', () => {
    expect(themes.light.primary?.$extensions['com.atexis.hex']).toBe('#2E74B5');
  });

  it('is fully exposed to Tailwind by globals.css', () => {
    for (const name of Object.keys(themes.light)) {
      expect(globalsCss, name).toContain(`--color-${name}: var(--${name});`);
    }
  });

  it('keeps raw colour values out of components (HR0/HR8)', () => {
    expect(globalsCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b|hsl\(|rgb\(/);
  });
});
