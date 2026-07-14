import { Link, useLocation } from 'react-router';
import { CalendarCheck2 } from 'lucide-react';
import type { SessionInfoResponse } from '@booking/contracts';
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
import { DASHBOARD_AREAS } from '~/lib/navigation';
import { NavUser } from './nav-user';

/** Set of all permission keys the user holds in a given scope level. */
function permissionsForScope(info: SessionInfoResponse, scope: string): Set<string> {
  const keys = new Set<string>();
  for (const membership of info.scopes) {
    if (membership.scope === scope) {
      for (const key of membership.permissions) keys.add(key);
    }
  }
  return keys;
}

export function AppSidebar({ info }: { info: SessionInfoResponse }) {
  const location = useLocation();
  const scopes = new Set(info.scopes.map((s) => s.scope));
  const areas = DASHBOARD_AREAS.filter((area) => scopes.has(area.scope));

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <CalendarCheck2 className="size-5" />
          </div>
          <div className="grid leading-tight">
            <span className="text-sm font-semibold">Bookify</span>
            <span className="text-xs text-muted-foreground">Dashboard</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {areas.map((area) => {
          const held = permissionsForScope(info, area.scope);
          const items = area.items.filter((item) => !item.permission || held.has(item.permission));
          return (
            <SidebarGroup key={area.scope}>
              <SidebarGroupLabel>{area.title}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((item) => {
                  const isActive =
                    location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
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
        })}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={info.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
