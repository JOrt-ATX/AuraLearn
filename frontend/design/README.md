# Design tokens

Single source of truth for the visual language (`aacf/styles/design-system.md`, Layer 1).

- `tokens/light.tokens.json` / `tokens/dark.tokens.json`: W3C DTCG, colours in OKLCH. The original
  hex from `aacf/styles/branding.md` is kept in `$extensions["com.atexis.hex"]`; `src/test/tokens.test.ts`
  checks that both agree and that every foreground/background pair meets WCAG 2.2 AA.
- `tokens/shared.tokens.json`: radius, spacing and font families.
- `build-tokens.mjs` compiles them with Style Dictionary to `src/styles/tokens.css` (generated, not
  committed; `npm run tokens`, run automatically by `dev`, `build`, `test` and Storybook).

The dark theme is not defined in `branding.md`; it is derived from the same neutral palette and
follows `prefers-color-scheme`. Components reference semantic variables (`--primary`, `--radius`),
never raw values (HR0/HR8).

Deviation from `branding.md`: it suggests _Primary Light_ (`#4A8CCB`) for links, which has a 3.5:1
contrast on white and fails WCAG 2.2 AA. Links use `--primary` (4.9:1); `--primary-light` is kept
for hover surfaces and illustrations only.

Second deviation: `branding.md` gives `#64748B` for secondary text. On the `muted` surface (`#F1F5F9`)
that is 4.34:1, below the 4.5:1 AA minimum. The light `--muted-foreground` is `#617188` (4.54:1 on
`muted`, 4.97:1 on white), the lightest slate that passes. The test suite fails if either theme
drops below AA.
