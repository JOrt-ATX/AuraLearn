import { GlobeIcon, HomeIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { SUPPORTED_LOCALES } from '@/i18n';
import { useUiStore } from '@/stores/uiStore';

/** Ctrl+K / Cmd+K quick navigation (ui-kit.md). */
export function CommandPalette(): ReactNode {
  const t = useTranslations();
  const navigate = useNavigate();
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const setLocale = useUiStore((state) => state.setLocale);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setOpen(!useUiStore.getState().commandPaletteOpen);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [setOpen]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t('commandPalette.placeholder')} />
      <CommandList>
        <CommandEmpty>{t('commandPalette.empty')}</CommandEmpty>
        <CommandGroup heading={t('commandPalette.pages')}>
          <CommandItem
            onSelect={() => {
              void navigate('/');
              setOpen(false);
            }}
          >
            <HomeIcon aria-hidden="true" />
            {t('nav.home')}
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading={t('commandPalette.languages')}>
          {SUPPORTED_LOCALES.map((code) => (
            <CommandItem
              key={code}
              onSelect={() => {
                setLocale(code);
                setOpen(false);
              }}
            >
              <GlobeIcon aria-hidden="true" />
              {t(`languages.${code}`)}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
