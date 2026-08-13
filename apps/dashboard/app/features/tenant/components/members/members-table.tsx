import { Link, useFetcher } from 'react-router';
import type { TenantMember } from '@booking/contracts';
import { Avatar, AvatarFallback, AvatarImage } from '@booking/ui/components/ui/avatar';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Pencil, UserMinus } from 'lucide-react';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { ConfirmButton } from '~/components/confirm-button';
import { DateTimeValue } from '~/components/date-time-value';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { dashboardPaths } from '~/constants/paths';

interface RemoveMemberActionData {
  error?: string;
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
 */
export function MembersTable({
  members,
  error,
  currentUserId,
}: {
  members: TenantMember[];
  error: string | null;
  currentUserId: string;
}) {
  const columns: DataTableColumn<TenantMember>[] = [
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
        <MemberRowActions member={member} isSelf={member.userId === currentUserId} />
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

function MemberRowActions({ member, isSelf }: { member: TenantMember; isSelf: boolean }) {
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
            <Link to={dashboardPaths.tenant.member(member.userId)}>
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
              <UserMinus className="size-3.5" /> Gỡ khỏi tenant
            </Button>
          }
          title={`Gỡ ${member.fullName} khỏi tenant?`}
          description="Người này sẽ mất toàn bộ quyền truy cập bảng điều khiển của tenant ngay lập tức."
          confirmLabel="Gỡ khỏi tenant"
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
          Đây là tài khoản của bạn — không thể tự sửa vai trò hoặc tự gỡ khỏi tenant.
        </p>
      ) : null}
      {removeError ? <p className="text-xs text-destructive">{removeError}</p> : null}
    </div>
  );
}
