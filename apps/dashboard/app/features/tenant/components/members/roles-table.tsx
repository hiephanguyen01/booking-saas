import { Link, useFetcher } from 'react-router';
import type { TenantRoleDetail } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { ConfirmButton } from '~/components/confirm-button';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { dashboardPaths } from '~/constants/paths';

interface DeleteRoleActionData {
  error?: string;
}

/**
 * Tenant roles, system + custom. A system role (`isSystem`) is shared across
 * every tenant on the platform and immutable here — its row shows "Nhân bản"
 * instead of "Sửa"/"Xóa", never a disabled edit/delete pair.
 */
export function RolesTable({ roles, error }: { roles: TenantRoleDetail[]; error: string | null }) {
  const columns: DataTableColumn<TenantRoleDetail>[] = [
    {
      header: 'Vai trò',
      cell: (role) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{role.name}</p>
          <p className="text-xs text-muted-foreground">{role.permissions.length} quyền</p>
        </div>
      ),
    },
    {
      header: 'Loại',
      cell: (role) =>
        role.isSystem ? (
          <Badge variant="outline" className="font-normal">
            Hệ thống
          </Badge>
        ) : (
          <Badge variant="secondary" className="font-normal">
            Tuỳ chỉnh
          </Badge>
        ),
    },
    {
      header: 'Số người',
      cell: (role) => <span className="tabular-nums text-muted-foreground">{role.memberCount}</span>,
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (role) => <RoleRowActions role={role} />,
    },
  ];

  return (
    <DashboardDataTable
      columns={columns}
      data={roles}
      getRowKey={(role) => role.id}
      error={error}
      emptyMessage="Chưa có vai trò nào."
    />
  );
}

function RoleRowActions({ role }: { role: TenantRoleDetail }) {
  const fetcher = useFetcher<DeleteRoleActionData>();
  const { busy, run } = useSubmissionGuard(fetcher.state);
  const deleteError = fetcher.data?.error ?? null;

  if (role.isSystem) {
    return (
      <Button asChild size="sm" variant="ghost">
        <Link to={dashboardPaths.tenant.roleNew}>
          <Copy className="size-3.5" /> Nhân bản
        </Link>
      </Button>
    );
  }

  const inUse = role.memberCount > 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-1.5">
        <Button asChild size="sm" variant="ghost">
          <Link to={dashboardPaths.tenant.roleEdit(role.id)}>
            <Pencil className="size-3.5" /> Sửa
          </Link>
        </Button>
        <ConfirmButton
          trigger={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              disabled={busy || inUse}
              title={inUse ? `Đang được ${role.memberCount} người dùng — không thể xoá.` : undefined}
            >
              <Trash2 className="size-3.5" /> Xóa
            </Button>
          }
          title={`Xoá vai trò "${role.name}"?`}
          description="Hành động này không thể hoàn tác."
          confirmLabel="Xóa"
          destructive
          busy={busy}
          onConfirm={() => run(() => fetcher.submit({ intent: 'delete-role', roleId: role.id }, { method: 'post' }))}
        />
      </div>
      {deleteError ? <p className="text-xs text-destructive">{deleteError}</p> : null}
    </div>
  );
}
