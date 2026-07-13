import { data as routeData, useFetcher } from 'react-router';
import { Check, EyeOff, Undo2 } from 'lucide-react';
import type { ListingGroupResponse } from '@booking/shared';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { formatDate } from '../format';
import { PageHeader } from '../components/page';
import { ListingStatusBadge } from '../components/status';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Bài đăng · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.listings.read');
  const res = await apiGet<ListingGroupResponse[]>('/tenant/listing-groups', auth);
  return {
    groups: res.ok ? (res.data ?? []) : [],
    canModerate: can('tenant.listings.publish'),
    error: res.ok ? null : (res.error ?? 'Không tải được bài đăng.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const form = await request.formData();
  const id = String(form.get('id'));
  const intent = String(form.get('intent'));
  if (!['publish', 'hide', 'republish'].includes(intent)) {
    return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  }
  const res = await apiPost(`/tenant/listing-groups/${id}/${intent}`, {}, auth);
  if (!res.ok) return routeData({ error: res.error ?? 'Thao tác không thành công.' }, { status: 400 });
  return { ok: true };
}

export default function TenantListingGroups({ loaderData, actionData }: Route.ComponentProps) {
  const { groups, canModerate, error } = loaderData;
  const actionError = actionData && 'error' in actionData ? actionData.error : null;
  const pending = groups.filter((g) => g.status === 'pending_review').length;

  const columns: DataTableColumn<ListingGroupResponse>[] = [
    {
      header: 'Bài đăng',
      cell: (g) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{g.title}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{g.slug}</p>
        </div>
      ),
    },
    { header: 'Địa chỉ', cell: (g) => <span className="text-sm text-muted-foreground">{g.address ?? '—'}</span>, className: 'hidden md:table-cell', headClassName: 'hidden md:table-cell' },
    { header: 'Cập nhật', cell: (g) => <span className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(g.updatedAt)}</span>, className: 'hidden lg:table-cell', headClassName: 'hidden lg:table-cell' },
    {
      header: 'Trạng thái',
      cell: (g) => (
        <div className="flex items-center gap-1.5">
          <ListingStatusBadge status={g.status} />
          {g.hiddenBy === 'admin' ? <Badge variant="outline" className="text-amber-600 dark:text-amber-400">Admin ẩn</Badge> : null}
        </div>
      ),
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (g) => (canModerate ? <RowActions group={g} /> : null),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bài đăng"
        description={
          pending > 0
            ? `${pending} bài đăng đang chờ duyệt.`
            : 'Duyệt, ẩn hoặc mở lại các bài đăng (studio, photographer…) của đối tác.'
        }
      />
      {error || actionError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error ?? actionError}
        </div>
      ) : null}
      <DataTable columns={columns} data={groups} getRowKey={(g) => g.id} emptyMessage="Chưa có bài đăng nào." />
    </div>
  );
}

function RowActions({ group }: { group: ListingGroupResponse }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  const submit = (intent: string): void => {
    fetcher.submit({ id: group.id, intent }, { method: 'post' });
  };

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {group.status === 'pending_review' || group.status === 'draft' ? (
        <Button size="xs" disabled={busy} onClick={() => submit('publish')}>
          <Check className="size-3.5" /> Duyệt
        </Button>
      ) : null}
      {group.status === 'published' ? (
        <Button size="xs" variant="outline" disabled={busy} onClick={() => submit('hide')}>
          <EyeOff className="size-3.5" /> Ẩn
        </Button>
      ) : null}
      {group.status === 'archived' ? (
        <Button size="xs" variant="outline" disabled={busy} onClick={() => submit('republish')}>
          <Undo2 className="size-3.5" /> Mở lại
        </Button>
      ) : null}
    </div>
  );
}
