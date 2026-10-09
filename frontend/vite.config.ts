import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The API target is dev tooling only; production serves both behind the same origin (nginx).
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { port: 5173, proxy: { '/api': { target: apiTarget } } },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}', 'design/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // components/ui is vendored shadcn/ui code: it is exercised through the app tests and
      // checked visually and with axe in Storybook, but its internals are not ours to unit test.
      exclude: [
        'src/components/ui/**',
        'src/**/*.stories.tsx',
        'src/test/**',
        'src/services/schema.d.ts',
        'src/main.tsx',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
