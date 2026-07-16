import { data as routeData, Link, useFetcher } from 'react-router';
import { Check, Eye, EyeOff, Undo2 } from 'lucide-react';
import type { ListingGroupResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { formatDate } from '~/lib/format';
import { PageHeader } from '~/components/page-header';
import { Money } from '~/components/money';
import { ListingStatusBadge } from '~/components/status-badge';

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
  if (!res.ok) {
    const error =
      res.code === 'LISTING_HAS_CONTACT_INFO'
        ? 'Có thông tin liên hệ. Chọn “Xem” để kiểm tra và duyệt bất chấp cảnh báo.'
        : (res.error ?? 'Thao tác không thành công.');
    return routeData({ error, code: res.code }, { status: 400 });
  }
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
          <Link
            to={`/tenant/listing-groups/${g.id}/review`}
            className="truncate font-medium hover:underline"
          >
            {g.title}
          </Link>
          <p className="truncate font-mono text-xs text-muted-foreground">{g.slug}</p>
        </div>
      ),
    },
    {
      header: 'Địa chỉ',
      cell: (g) => <span className="text-sm text-muted-foreground">{g.address ?? '—'}</span>,
      className: 'hidden md:table-cell',
      headClassName: 'hidden md:table-cell',
    },
    {
      header: 'Giá từ',
      cell: (g) =>
        g.priceFrom ? (
          <Money value={g.priceFrom} className="text-sm" />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
      className: 'hidden sm:table-cell whitespace-nowrap',
      headClassName: 'hidden sm:table-cell',
    },
    {
      header: 'Cập nhật',
      cell: (g) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDate(g.updatedAt)}
        </span>
      ),
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
    },
    {
      header: 'Trạng thái',
      cell: (g) => (
        <div className="flex items-center gap-1.5">
          <ListingStatusBadge status={g.status} />
          {g.hiddenBy === 'admin' ? (
            <Badge variant="outline" className="border-warning/40 text-warning">
              Admin ẩn
            </Badge>
          ) : null}
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
            : 'Duyệt, ẩn hoặc mở lại các bài đăng nhóm của đối tác.'
        }
      />
      {error || actionError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error ?? actionError}
        </div>
      ) : null}
      <DataTable
        columns={columns}
        data={groups}
        getRowKey={(g) => g.id}
        emptyMessage="Chưa có bài đăng nào."
      />
    </div>
  );
}

function RowActions({ group }: { group: ListingGroupResponse }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <fetcher.Form method="post" className="flex flex-wrap justify-end gap-1.5">
        <input type="hidden" name="id" value={group.id} />
        <Button asChild size="xs" variant="ghost">
          <Link to={`/tenant/listing-groups/${group.id}/review`}>
            <Eye data-icon="inline-start" /> Xem
          </Link>
        </Button>
        {group.status === 'pending_review' ? (
          <Button type="submit" name="intent" value="publish" size="xs" disabled={busy}>
            <Check data-icon="inline-start" /> Duyệt
          </Button>
        ) : null}
        {group.status === 'published' ? (
          <Button
            type="submit"
            name="intent"
            value="hide"
            size="xs"
            variant="outline"
            disabled={busy}
          >
            <EyeOff data-icon="inline-start" /> Ẩn
          </Button>
        ) : null}
        {group.status === 'archived' ? (
          <Button
            type="submit"
            name="intent"
            value="republish"
            size="xs"
            variant="outline"
            disabled={busy}
          >
            <Undo2 data-icon="inline-start" /> Mở lại
          </Button>
        ) : null}
      </fetcher.Form>
      {error ? <p className="max-w-56 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
