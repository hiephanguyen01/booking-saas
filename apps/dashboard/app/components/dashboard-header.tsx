import { Fragment } from 'react';
import { Link, useLocation } from 'react-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@booking/ui/components/ui/breadcrumb';
import { Separator } from '@booking/ui/components/ui/separator';
import { SidebarTrigger } from '@booking/ui/components/ui/sidebar';
import { ModeToggle } from '@booking/ui/components/theme/mode-toggle';
import { DASHBOARD_AREAS } from '~/lib/navigation';

const LABELS: Record<string, string> = Object.fromEntries(
  DASHBOARD_AREAS.map((area) => [area.basePath.replace(/^\//, ''), area.title]),
);

function humanize(segment: string): string {
  return LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
}

interface Crumb {
  label: string;
  href: string;
}

function crumbsFor(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [];
  let href = '';
  for (const segment of segments) {
    href += `/${segment}`;
    crumbs.push({ label: humanize(segment), href });
  }
  return crumbs;
}

/** Sticky app-bar: sidebar toggle, breadcrumb trail (from the URL), theme switch. */
export function DashboardHeader() {
  const location = useLocation();
  const crumbs = crumbsFor(location.pathname);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.length === 0 ? (
            <BreadcrumbItem>
              <BreadcrumbPage>Tổng quan</BreadcrumbPage>
            </BreadcrumbItem>
          ) : (
            crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <Fragment key={crumb.href}>
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {isLast ? null : <BreadcrumbSeparator />}
                </Fragment>
              );
            })
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-2">
        <ModeToggle />
      </div>
    </header>
  );
}
