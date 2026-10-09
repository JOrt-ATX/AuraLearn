import { Fragment, type ReactNode } from 'react';
import { Link, useMatches } from 'react-router';
import { useTranslations } from 'use-intl';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { RouteHandle } from '@/router';

function hasCrumb(handle: unknown): handle is RouteHandle {
  return typeof handle === 'object' && handle !== null && 'crumb' in handle;
}

/** Breadcrumb trail built from the matched routes' `handle.crumb` i18n keys. */
export function AppBreadcrumbs(): ReactNode {
  const t = useTranslations();
  const crumbs = useMatches().flatMap((match) =>
    hasCrumb(match.handle) ? [{ id: match.id, to: match.pathname, key: match.handle.crumb }] : [],
  );

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.id}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{t(crumb.key)}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.to}>{t(crumb.key)}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
