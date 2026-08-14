import { Link, useSearchParams } from 'react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { Button } from '@booking/ui/components/ui/button';
import { Mail, UserPlus, UsersRound } from 'lucide-react';
import type { Route } from './+types/_index';
import { loadPartnerMembers } from '~/features/partner/server/members-loader.server';
import { handlePartnerMembersAction } from '~/features/partner/server/members-actions.server';
import { PageHeader } from '~/components/page-header';
import { MembersTable } from '~/features/tenant/components/members/members-table';
import { InvitationsTable } from '~/features/tenant/components/members/invitations-table';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Nhân sự · Đối tác · BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadPartnerMembers(request);
}

export async function action({ request }: Route.ActionArgs) {
  return handlePartnerMembersAction({ request });
}

/**
 * Two tabs only — Thành viên and Lời mời. This tier ships no role builder
 * (`loadPartnerMembers` already 403s a caller lacking `partner.members.manage`
 * before this component ever renders, so there is no third "no permission"
 * branch to handle the way the tenant tier's per-tab gating does), and reuses
 * `MembersTable`/`InvitationsTable` as-is from the tenant tier's component
 * folder (see those files' comments for the two seams that had to be
 * generalised: `editHref`/`scopeLabel` on `MembersTable` for the partner
 * tier's own path and copy).
 */
export default function PartnerMembers({ loaderData }: Route.ComponentProps) {
  const { members, membersError, invitations, invitationsError, currentUserId } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = [
    { value: 'members', label: 'Thành viên', icon: UsersRound },
    { value: 'invitations', label: 'Lời mời', icon: Mail },
  ] as const;
  const requestedTab = searchParams.get('section');
  const activeTab = tabs.find((tab) => tab.value === requestedTab)?.value ?? tabs[0].value;

  const selectTab = (value: string): void => {
    const next = new URLSearchParams(searchParams);
    next.set('section', value);
    setSearchParams(next, { preventScrollReset: true, replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhân sự"
        description="Quản lý thành viên và lời mời truy cập bảng điều khiển của đối tác."
        actions={
          <Button asChild variant="outline">
            <Link to={dashboardPaths.partner.memberInvite}>
              <UserPlus className="size-4" /> Mời nhân sự
            </Link>
          </Button>
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
          <MembersTable
            members={members}
            error={membersError}
            currentUserId={currentUserId}
            editHref={dashboardPaths.partner.member}
            scopeLabel="đối tác"
          />
        </TabsContent>

        <TabsContent value="invitations" forceMount className="space-y-4 data-[state=inactive]:hidden">
          <InvitationsTable invitations={invitations} error={invitationsError} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
