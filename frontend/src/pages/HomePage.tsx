import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useReadiness } from '@/hooks/useReadiness';

export function HomePage(): ReactNode {
  const t = useTranslations();
  const readiness = useReadiness();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('home.title')}</h1>
        <p className="text-muted-foreground">{t('home.subtitle')}</p>
      </div>
      <section
        aria-labelledby="service-status"
        className="flex flex-col gap-3 rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
      >
        <h2 id="service-status" className="text-xl font-semibold">
          {t('home.status.title')}
        </h2>
        <div role="status" aria-live="polite">
          {readiness.isPending && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <span className="sr-only">{t('home.status.checking')}</span>
            </div>
          )}
          {readiness.isSuccess && (
            <p className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-success" />
              {t('home.status.ready')}
            </p>
          )}
          {readiness.isError && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex items-center gap-2 text-destructive">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-destructive" />
                {t('home.status.unavailable')}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void readiness.refetch();
                }}
              >
                {t('common.retry')}
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
