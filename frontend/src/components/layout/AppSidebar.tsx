import { HomeIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useTranslations } from 'use-intl';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

export function AppSidebar(): ReactNode {
  const t = useTranslations();

  return (
    <Sidebar collapsible="icon" aria-label={t('nav.main')}>
      <SidebarHeader>
        <div className="flex h-8 items-center gap-2 px-2 font-semibold">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground"
          >
            AL
          </span>
          <span className="truncate group-data-[collapsible=icon]:hidden">{t('app.name')}</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={t('nav.home')}>
                  <NavLink to="/" end>
                    <HomeIcon aria-hidden="true" />
                    <span>{t('nav.home')}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
