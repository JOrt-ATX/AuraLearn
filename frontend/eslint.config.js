import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const STORAGE_MESSAGE =
  'Browser storage is forbidden for state (HR1): Postgres is the source of truth and the session lives in an HTTP-only cookie.';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'storybook-static', 'src/services/schema.d.ts'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // HR1: no localStorage / sessionStorage, however they are reached.
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: STORAGE_MESSAGE },
        { name: 'sessionStorage', message: STORAGE_MESSAGE },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: STORAGE_MESSAGE },
        { object: 'window', property: 'sessionStorage', message: STORAGE_MESSAGE },
        { object: 'globalThis', property: 'localStorage', message: STORAGE_MESSAGE },
        { object: 'globalThis', property: 'sessionStorage', message: STORAGE_MESSAGE },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // HR6: never cut content to fit a limit; summarize it with the LLM instead.
          selector: "CallExpression[callee.property.name='slice'][arguments.0.value=0]",
          message:
            'HR6: do not truncate content with slice(0, n). If this is not content (e.g. pagination), disable the rule on this line and say why.',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'RS-15: AI output is untrusted. Sanitize it in a dedicated component instead.',
        },
      ],
      'no-console': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // Plain JS tooling files are not part of any tsconfig.
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
  {
    // Vendored shadcn/ui primitives: kept close to upstream so they can be re-synced.
    files: ['src/components/ui/**'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-syntax': 'off',
      // Tests may assert that the app leaves browser storage untouched.
      'no-restricted-properties': 'off',
    },
  },
  prettier,
);
