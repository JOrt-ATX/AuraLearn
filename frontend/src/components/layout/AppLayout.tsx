import { SearchIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { useTranslations } from 'use-intl';

import { AppBreadcrumbs } from '@/components/layout/AppBreadcrumbs';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { LanguageSelect } from '@/components/layout/LanguageSelect';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUiStore } from '@/stores/uiStore';

const MAIN_ID = 'main-content';

export function AppLayout(): ReactNode {
  const t = useTranslations();
  const openPalette = useUiStore((state) => state.setCommandPaletteOpen);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <a
          href={`#${MAIN_ID}`}
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          {t('layout.skipToContent')}
        </a>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
            <AppBreadcrumbs />
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  openPalette(true);
                }}
                aria-label={t('layout.openCommandPalette')}
                aria-keyshortcuts="Control+K Meta+K"
              >
                <SearchIcon aria-hidden="true" />
                <span className="hidden sm:inline">{t('common.search')}</span>
                <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground sm:inline">
                  {t('layout.commandShortcut')}
                </kbd>
              </Button>
              <LanguageSelect />
            </div>
          </header>
          <main id={MAIN_ID} tabIndex={-1} className="flex-1 p-6 outline-none">
            <Outlet />
          </main>
        </SidebarInset>
        <CommandPalette />
        <Toaster position="bottom-right" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
