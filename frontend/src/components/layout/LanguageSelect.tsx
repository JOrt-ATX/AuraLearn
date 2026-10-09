import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { isLocale, SUPPORTED_LOCALES } from '@/i18n';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUiStore } from '@/stores/uiStore';

export function LanguageSelect(): ReactNode {
  const t = useTranslations();
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);

  return (
    <Select
      value={locale}
      onValueChange={(value) => {
        if (isLocale(value)) setLocale(value);
      }}
    >
      <SelectTrigger size="sm" aria-label={t('layout.language')} className="w-auto min-w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SUPPORTED_LOCALES.map((code) => (
          <SelectItem key={code} value={code} lang={code}>
            {t(`languages.${code}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
