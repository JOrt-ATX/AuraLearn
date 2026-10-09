import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { RouterProvider } from 'react-router';
import { vi } from 'vitest';

import type { Locale } from '@/i18n';
import { I18nProvider } from '@/i18n/I18nProvider';
import { createTestRouter } from '@/router';
import { useUiStore } from '@/stores/uiStore';

type FetchMock = (request: Request) => Response | Promise<Response>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Replace the global fetch for the current test; the client resolves it on every call. */
export function mockFetch(handler: FetchMock): ReturnType<typeof vi.fn> {
  const mock = vi.fn((request: Request) => Promise.resolve(handler(request)));
  vi.stubGlobal('fetch', mock);
  return mock;
}

export function renderApp(path = '/', locale: Locale = 'en'): RenderResult {
  useUiStore.setState({ locale });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={createTestRouter([path])} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

/** Make `matchMedia` report a match for every query (a phone-sized viewport). */
export function setMobileViewport(): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: true,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  });
}
