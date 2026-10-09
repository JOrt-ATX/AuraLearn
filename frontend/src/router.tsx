import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router';

import { AppLayout } from '@/components/layout/AppLayout';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import type { MessageKey } from '@/types/i18n';

/** Route metadata: `crumb` is an i18n key shown in the breadcrumb trail (HR15). */
export interface RouteHandle {
  crumb: MessageKey;
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage />, handle: { crumb: 'nav.home' } satisfies RouteHandle },
      {
        path: '*',
        element: <NotFoundPage />,
        handle: { crumb: 'notFound.title' } satisfies RouteHandle,
      },
    ],
  },
];

export const createAppRouter = (): ReturnType<typeof createBrowserRouter> =>
  createBrowserRouter(routes);

export const createTestRouter = (initialEntries: string[]): ReturnType<typeof createMemoryRouter> =>
  createMemoryRouter(routes, { initialEntries });
