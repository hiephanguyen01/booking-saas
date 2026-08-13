import { Link, useSearchParams } from 'react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { Button } from '@booking/ui/components/ui/button';
import { Mail, Plus, ShieldCheck, UserPlus, UsersRound } from 'lucide-react';
import type { Route } from './+types/_index';
import { loadTenantMembers } from '~/features/tenant/server/members-loader.server';
import { handleMembersAction } from '~/features/tenant/server/members-actions.server';
import { PageHeader } from '~/components/page-header';
import { MembersTable } from '~/features/tenant/components/members/members-table';
import { InvitationsTable } from '~/features/tenant/components/members/invitations-table';
import { RolesTable } from '~/features/tenant/components/members/roles-table';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Nhân sự · Tenant · BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadTenantMembers(request);
}

export async function action({ request }: Route.ActionArgs) {
  return handleMembersAction({ request });
}

/**
 * Members/invitations tabs need only `tenant.members.manage` — `loadTenantMembers`
 * already requires it to reach this loader at all (a caller lacking it never gets
 * a successful response to render), so they need no further runtime gate. Only the
 * "Vai trò" tab is conditional, on `canManageRoles` (`can('tenant.roles.manage')`,
 * resolved server-side by the loader — `can` itself is a function and would decode
 * to `undefined` once loader data crosses the client hydration boundary, so the
 * loader hands over the already-evaluated boolean instead of the function).
 */
export default function TenantMembers({ loaderData }: Route.ComponentProps) {
  const { members, membersError, invitations, invitationsError, roles, rolesError, canManageRoles } =
    loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = [
    { value: 'members', label: 'Nhân sự', icon: UsersRound },
    { value: 'invitations', label: 'Lời mời', icon: Mail },
    canManageRoles ? { value: 'roles', label: 'Vai trò', icon: ShieldCheck } : null,
  ].filter((tab) => tab !== null);
  const requestedTab = searchParams.get('section');
  const activeTab = tabs.find((tab) => tab.value === requestedTab)?.value ?? 'members';

  const selectTab = (value: string): void => {
    const next = new URLSearchParams(searchParams);
    next.set('section', value);
    setSearchParams(next, { preventScrollReset: true, replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhân sự"
        description="Quản lý thành viên, lời mời và vai trò truy cập bảng điều khiển của tenant."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={dashboardPaths.tenant.memberInvite}>
                <UserPlus className="size-4" /> Mời nhân sự
              </Link>
            </Button>
            {canManageRoles ? (
              <Button asChild>
                <Link to={dashboardPaths.tenant.roleNew}>
                  <Plus className="size-4" /> Tạo vai trò
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={selectTab}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              <tab.icon className="size-4" /> {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="members" forceMount className="space-y-4 data-[state=inactive]:hidden">
          <MembersTable members={members} error={membersError} />
        </TabsContent>

        <TabsContent value="invitations" forceMount className="space-y-4 data-[state=inactive]:hidden">
          <InvitationsTable invitations={invitations} error={invitationsError} />
        </TabsContent>

        {canManageRoles ? (
          <TabsContent value="roles" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <RolesTable roles={roles ?? []} error={rolesError} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
