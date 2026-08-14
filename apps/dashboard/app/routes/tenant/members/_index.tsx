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
 * Every tab is conditional — `loadTenantMembers` no longer requires either
 * permission to reach the loader (a caller holding only `tenant.roles.manage`
 * must still land here and see the "Vai trò" tab, not a 403), so "Nhân sự"/
 * "Lời mời" are gated on `canManageMembers` and "Vai trò" on `canManageRoles`,
 * both already evaluated server-side by the loader. Neither is ever read as a
 * live `can(...)` call here — `can` itself is a function and would decode to
 * `undefined` once loader data crosses the client hydration boundary (React
 * Router 8's single-fetch wire format has no encoding for a function value),
 * so the loader hands over precomputed booleans instead.
 */
export default function TenantMembers({ loaderData }: Route.ComponentProps) {
  const {
    members,
    membersError,
    invitations,
    invitationsError,
    roles,
    rolesError,
    currentUserId,
    canManageMembers,
    canManageRoles,
  } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = [
    canManageMembers ? { value: 'members', label: 'Nhân sự', icon: UsersRound } : null,
    canManageMembers ? { value: 'invitations', label: 'Lời mời', icon: Mail } : null,
    canManageRoles ? { value: 'roles', label: 'Vai trò', icon: ShieldCheck } : null,
  ].filter((tab) => tab !== null);
  const requestedTab = searchParams.get('section');
  // `tabs` is never empty here — the loader 403s outright when the caller
  // holds neither permission, so there is always at least one tab to fall
  // back to.
  const activeTab = tabs.find((tab) => tab.value === requestedTab)?.value ?? tabs[0]!.value;

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
            {canManageMembers ? (
              <Button asChild variant="outline">
                <Link to={dashboardPaths.tenant.memberInvite}>
                  <UserPlus className="size-4" /> Mời nhân sự
                </Link>
              </Button>
            ) : null}
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

        {canManageMembers ? (
          <TabsContent value="members" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <MembersTable
              members={members ?? []}
              error={membersError}
              currentUserId={currentUserId}
              editHref={dashboardPaths.tenant.member}
              scopeLabel="tenant"
            />
          </TabsContent>
        ) : null}

        {canManageMembers ? (
          <TabsContent value="invitations" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <InvitationsTable invitations={invitations ?? []} error={invitationsError} />
          </TabsContent>
        ) : null}

        {canManageRoles ? (
          <TabsContent value="roles" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <RolesTable roles={roles ?? []} error={rolesError} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
