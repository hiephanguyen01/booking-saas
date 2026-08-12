import { Link, useLocation } from 'react-router';
import { CalendarCheck2, PanelsTopLeft } from 'lucide-react';
import type { SessionInfoResponse } from '@booking/contracts';
import { Image } from '@booking/ui/components/media/image';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@booking/ui/components/ui/sidebar';
import { dashboardAreasFor } from '~/lib/navigation';
import type { DashboardHostResolution } from '~/lib/tenant-host.server';
import { NavUser } from './nav-user';

export function AppSidebar({
  info,
  host,
  platformConsoleUrl,
}: {
  info: SessionInfoResponse;
  host: DashboardHostResolution;
  platformConsoleUrl: string;
}) {
  const location = useLocation();
  const areas = dashboardAreasFor(info, host);
  const activeNavPath = areas
    .flatMap((area) => area.items)
    .filter(
      (item) =>
        location.pathname === item.to ||
        location.pathname.startsWith(`${item.to}/`) ||
        item.activePrefixes?.some(
          (prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`),
        ),
    )
    .sort((left, right) => right.to.length - left.to.length)[0]?.to;
  const hostTenant = host.kind === 'tenant' ? host.tenant : null;
  const appIconUrl = hostTenant?.branding?.faviconUrl || hostTenant?.branding?.logoUrl || null;
  const workspaceName = hostTenant?.name ?? 'BookingOS';

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary text-primary-foreground">
            {appIconUrl ? (
              <Image src={appIconUrl} alt="" loading="eager" className="size-full object-contain" />
            ) : (
              <CalendarCheck2 className="size-5" />
            )}
          </div>
          <div className="grid leading-tight">
            <span className="truncate text-sm font-semibold">{workspaceName}</span>
            <span className="truncate text-xs text-muted-foreground">Dashboard</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {info.scopes.filter((scope) => scope.scope === 'tenant' || scope.scope === 'partner')
          .length > 1 ? (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                {/* An <a>, not a <Link>: /workspaces lives on the platform console,
                    a different origin from a tenant host, which the client-side
                    router cannot navigate to. */}
                <SidebarMenuButton asChild tooltip="Đổi không gian làm việc">
                  <a href={`${platformConsoleUrl}/workspaces`}>
                    <PanelsTopLeft />
                    <span>Đổi workspace</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        ) : null}
        {areas.map((area) => {
          return area.sections.map((section, index) => {
            const items = section.items;
            if (items.length === 0) return null;
            // The leading unlabelled cluster (overview) borrows the area title so
            // multi-area users can still tell the areas apart.
            const label = section.label ?? (index === 0 ? area.title : undefined);
            return (
              <SidebarGroup key={`${area.basePath}-${index}`}>
                {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
                <SidebarMenu>
                  {items.map((item) => {
                    const isActive = item.to === activeNavPath;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.title}
                          className="data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                        >
                          <Link to={item.to}>
                            {item.icon ? <item.icon /> : null}
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            );
          });
        })}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={info.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
