/**
 * Turn a machine token (snake_case, kebab-case, dotted or camelCase) into readable words (HR21).
 * Used as the last-resort display for an unknown enum value; known values must have a translation.
 */
export function humanize(token: string, locale?: string): string {
  const words = token
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .filter((word) => word.length > 0);
  return words
    .map(
      (word) => word.charAt(0).toLocaleUpperCase(locale) + word.slice(1).toLocaleLowerCase(locale),
    )
    .join(' ');
}

/** Humanize a list of tokens and join it the way the locale reads ("A, B and C"). */
export function humanizeList(tokens: readonly string[], locale: string): string {
  const formatter = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });
  return formatter.format(tokens.map((token) => humanize(token, locale)));
}
