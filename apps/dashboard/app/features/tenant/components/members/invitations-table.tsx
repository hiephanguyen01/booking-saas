import { useFetcher } from 'react-router';
import type { TenantInvitation } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Ban } from 'lucide-react';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { ConfirmButton } from '~/components/confirm-button';
import { DateTimeValue } from '~/components/date-time-value';
import { TenantInvitationStatusBadge } from '~/components/status-badge';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';

interface RevokeInvitationActionData {
  error?: string;
}

/**
 * Pending + historical staff invitations. Only a `pending` row can still be
 * revoked — an accepted/revoked/expired invitation has nothing left to undo,
 * so its action cell renders empty rather than a disabled button.
 */
export function InvitationsTable({
  invitations,
  error,
}: {
  invitations: TenantInvitation[];
  error: string | null;
}) {
  const columns: DataTableColumn<TenantInvitation>[] = [
    { header: 'Email', cell: (invitation) => <span className="font-medium">{invitation.email}</span> },
    {
      header: 'Vai trò',
      cell: (invitation) => (
        <div className="flex flex-wrap gap-1">
          {invitation.roles.map((role) => (
            <Badge key={role.id} variant="outline" className="font-normal">
              {role.name}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      header: 'Trạng thái',
      cell: (invitation) => <TenantInvitationStatusBadge status={invitation.status} />,
    },
    {
      header: 'Hết hạn',
      cell: (invitation) => (
        <DateTimeValue iso={invitation.expiresAt} className="text-sm text-muted-foreground" />
      ),
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (invitation) =>
        invitation.status === 'pending' ? <RevokeInvitationAction invitation={invitation} /> : null,
    },
  ];

  return (
    <DashboardDataTable
      columns={columns}
      data={invitations}
      getRowKey={(invitation) => invitation.id}
      error={error}
      emptyMessage="Chưa có lời mời nào."
    />
  );
}

function RevokeInvitationAction({ invitation }: { invitation: TenantInvitation }) {
  const fetcher = useFetcher<RevokeInvitationActionData>();
  const { busy, run } = useSubmissionGuard(fetcher.state);
  const revokeError = fetcher.data?.error ?? null;

  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmButton
        trigger={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={busy}
          >
            <Ban className="size-3.5" /> Thu hồi
          </Button>
        }
        title={`Thu hồi lời mời tới ${invitation.email}?`}
        description="Liên kết mời sẽ ngừng hoạt động ngay lập tức và người này sẽ không thể tham gia bằng lời mời này nữa."
        confirmLabel="Thu hồi"
        destructive
        busy={busy}
        onConfirm={() =>
          run(() =>
            fetcher.submit(
              { intent: 'revoke-invitation', invitationId: invitation.id },
              { method: 'post' },
            ),
          )
        }
      />
      {revokeError ? <p className="text-xs text-destructive">{revokeError}</p> : null}
    </div>
  );
}
