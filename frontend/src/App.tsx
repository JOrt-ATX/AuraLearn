import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { RouterProvider } from 'react-router';

import { I18nProvider } from '@/i18n/I18nProvider';
import { createAppRouter } from '@/router';

export function App(): ReactNode {
  const [queryClient] = useState(() => new QueryClient());
  const [router] = useState(createAppRouter);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>
  );
}
