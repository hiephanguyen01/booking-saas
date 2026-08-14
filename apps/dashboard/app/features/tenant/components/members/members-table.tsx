import { Link, useFetcher } from 'react-router';
import type { RoleRef } from '@booking/contracts';
import { Avatar, AvatarFallback, AvatarImage } from '@booking/ui/components/ui/avatar';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Pencil, UserMinus } from 'lucide-react';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { ConfirmButton } from '~/components/confirm-button';
import { DateTimeValue } from '~/components/date-time-value';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';

interface RemoveMemberActionData {
  error?: string;
}

/**
 * The subset of a staff roster row this table (and `MemberForm`'s edit mode)
 * actually reads — deliberately narrower than `TenantMember`/`PartnerMember`,
 * whose `permissions` arrays are typed to two disjoint enums
 * (`TenantPermissionKey[]` vs `PartnerPermissionKey[]`) and are therefore not
 * mutually assignable. Neither this table nor the form ever reads
 * `permissions`, so dropping it here is what lets both `TenantMember[]` and
 * `PartnerMember[]` satisfy this prop type with no cast. Task 7 (partner
 * staff) is the first caller from outside the tenant tier — see
 * `routes/partner/members/_index.tsx`.
 */
export interface StaffMember {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  roles: RoleRef[];
  joinedAt: string;
}

/** Two-letter fallback for an avatar with no image — first + last name initial. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0];
  const last = parts.length > 1 ? parts[parts.length - 1]![0] : '';
  return (first + last).toUpperCase();
}

/**
 * Staff roster for the tenant. Multi-role is the normal case (not an edge
 * case), so every member's chip list renders in full — never truncated to the
 * first role or collapsed into one string. "Gỡ khỏi tenant" runs behind
 * `ConfirmButton` (never `window.confirm`, which would block the extension
 * driven browser check later in the plan) and each row owns its own fetcher so
 * one row's in-flight request never disables the rest of the table.
 *
 * The backend refuses to let a member edit or remove themselves
 * (`CANNOT_EDIT_SELF`), so the signed-in user's own row disables "Sửa vai
 * trò"/"Gỡ khỏi tenant" instead of offering an action that can only ever
 * fail — `currentUserId` comes from `members-loader.server.ts` as a plain
 * string (never a live session object) for the same turbo-stream reason
 * documented there.
 *
 * `editHref` builds the "Sửa vai trò" link — a caller-supplied path builder
 * rather than a hardcoded `dashboardPaths.tenant.member(...)` (this table's
 * only real coupling to the tenant tier before Task 7), since the partner
 * tier's edit screen lives at a different URL (`dashboardPaths.partner.member`).
 *
 * `scopeLabel` is the Vietnamese noun the "Gỡ khỏi …" copy names — "tenant"
 * here, "đối tác" for the partner tier. Without this the remove button,
 * confirm dialog and self-row note would tell a partner-tier operator they
 * are about to lose access to "tenant", which is simply false for that screen.
 */
export function MembersTable({
  members,
  error,
  currentUserId,
  editHref,
  scopeLabel,
}: {
  members: StaffMember[];
  error: string | null;
  currentUserId: string;
  editHref: (userId: string) => string;
  scopeLabel: string;
}) {
  const columns: DataTableColumn<StaffMember>[] = [
    {
      header: 'Thành viên',
      cell: (member) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar>
            {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
            <AvatarFallback>{initials(member.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{member.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Vai trò',
      cell: (member) => (
        <div className="flex flex-wrap gap-1">
          {member.roles.map((role) => (
            <Badge key={role.id} variant="outline" className="font-normal">
              {role.name}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      header: 'Tham gia',
      cell: (member) => <DateTimeValue iso={member.joinedAt} className="text-sm text-muted-foreground" />,
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (member) => (
        <MemberRowActions
          member={member}
          isSelf={member.userId === currentUserId}
          editHref={editHref}
          scopeLabel={scopeLabel}
        />
      ),
    },
  ];

  return (
    <DashboardDataTable
      columns={columns}
      data={members}
      getRowKey={(member) => member.userId}
      error={error}
      emptyMessage="Chưa có nhân sự nào."
    />
  );
}

function MemberRowActions({
  member,
  isSelf,
  editHref,
  scopeLabel,
}: {
  member: StaffMember;
  isSelf: boolean;
  editHref: (userId: string) => string;
  scopeLabel: string;
}) {
  const fetcher = useFetcher<RemoveMemberActionData>();
  const { busy, run } = useSubmissionGuard(fetcher.state);
  const removeError = fetcher.data?.error ?? null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-1.5">
        {isSelf ? (
          <Button type="button" size="sm" variant="ghost" disabled>
            <Pencil className="size-3.5" /> Sửa vai trò
          </Button>
        ) : (
          <Button asChild size="sm" variant="ghost">
            <Link to={editHref(member.userId)}>
              <Pencil className="size-3.5" /> Sửa vai trò
            </Link>
          </Button>
        )}
        <ConfirmButton
          trigger={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              disabled={busy || isSelf}
            >
              <UserMinus className="size-3.5" /> Gỡ khỏi {scopeLabel}
            </Button>
          }
          title={`Gỡ ${member.fullName} khỏi ${scopeLabel}?`}
          description={`Người này sẽ mất toàn bộ quyền truy cập bảng điều khiển của ${scopeLabel} ngay lập tức.`}
          confirmLabel={`Gỡ khỏi ${scopeLabel}`}
          destructive
          busy={busy}
          onConfirm={() =>
            run(() =>
              fetcher.submit({ intent: 'remove-member', userId: member.userId }, { method: 'post' }),
            )
          }
        />
      </div>
      {isSelf ? (
        <p className="text-xs text-muted-foreground">
          Đây là tài khoản của bạn — không thể tự sửa vai trò hoặc tự gỡ khỏi {scopeLabel}.
        </p>
      ) : null}
      {removeError ? <p className="text-xs text-destructive">{removeError}</p> : null}
    </div>
  );
}
