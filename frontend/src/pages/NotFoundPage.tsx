import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';

export function NotFoundPage(): ReactNode {
  const t = useTranslations();

  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4">
      <h1 className="text-3xl font-bold tracking-tight">{t('notFound.title')}</h1>
      <p className="text-muted-foreground">{t('notFound.description')}</p>
      <Button asChild>
        <Link to="/">{t('notFound.backHome')}</Link>
      </Button>
    </div>
  );
}
