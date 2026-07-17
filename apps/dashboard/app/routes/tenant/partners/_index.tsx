import { Link, useFetcher, data as routeData } from 'react-router';
import type { PartnerResponse, Paginated, PartnerStatus } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Badge } from '@booking/ui/components/ui/badge';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Check, Eye, Plus } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { formatDate } from '~/lib/format';
import { PARTNER_TYPE_LABEL as TYPE_LABEL } from '~/constants/partner';
import { PageHeader } from '~/components/page-header';
import { PartnerStatusBadge, PartnerVerificationBadge } from '~/components/status-badge';
import { StatusFilterTabs } from '~/components/status-filter-tabs';
import { useStatusFilter } from '~/hooks/use-status-filter';
import { PhoneLink } from '~/components/contact-link';
import { ErrorBanner } from '~/components/action-feedback';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Đối tác · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.partners.read');
  const res = await apiGet<Paginated<PartnerResponse>>('/tenant/partners?pageSize=100', auth);
  return {
    partners: res.ok ? (res.data?.items ?? []) : [],
    error: res.ok ? null : (res.error ?? 'Không tải được danh sách đối tác.'),
    canApprove: can('tenant.partners.approve'),
    canManage: can('tenant.partners.manage'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, can } = await requireTenant(request);
  if (!can('tenant.partners.approve')) {
    return routeData({ error: 'Bạn không có quyền duyệt đối tác.' }, { status: 403 });
  }
  const form = await request.formData();
  const id = String(form.get('id'));
  const res = await apiPost(`/tenant/partners/${id}/approve`, {}, auth);
  if (!res.ok) return routeData({ error: res.error ?? 'Không duyệt được đối tác.' }, { status: 400 });
  return { ok: true };
}

type Filter = 'all' | PartnerStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'suspended', label: 'Tạm ngưng' },
];

const getStatus = (p: PartnerResponse): string => p.status;

export default function TenantPartners({ loaderData }: Route.ComponentProps) {
  const { partners, error, canApprove, canManage } = loaderData;
  const { filter, setFilter, rows, counts } = useStatusFilter(partners, getStatus);

  const columns: DataTableColumn<PartnerResponse>[] = [
    {
      header: 'Đối tác',
      cell: (p) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link to={`/tenant/partners/${p.id}`} className="truncate font-medium hover:underline">
              {p.name}
            </Link>
            {p.isHouse ? (
              <Badge variant="outline" className="font-normal">
                Nội bộ
              </Badge>
            ) : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">/{p.slug}</div>
        </div>
      ),
    },
    {
      header: 'Loại',
      cell: (p) => (
        <span className="text-sm text-muted-foreground">{TYPE_LABEL[p.partnerType] ?? p.partnerType}</span>
      ),
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
    {
      header: 'Liên hệ',
      cell: (p) => <PhoneLink phone={p.contactInfo.phone} />,
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
    },
    {
      header: 'Xác minh',
      cell: (p) => <PartnerVerificationBadge status={p.verificationStatus} />,
      className: 'hidden md:table-cell',
      headClassName: 'hidden md:table-cell',
    },
    { header: 'Trạng thái', cell: (p) => <PartnerStatusBadge status={p.status} /> },
    {
      header: 'Tham gia',
      cell: (p) => <span className="text-sm text-muted-foreground">{formatDate(p.createdAt)}</span>,
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (p) => <RowActions partner={p} canApprove={canApprove} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đối tác"
        description="Duyệt, xác minh danh tính và quản lý các đối tác trong marketplace của bạn."
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link to="/tenant/partners/new">
                <Plus className="size-4" /> Thêm đối tác nội bộ
              </Link>
            </Button>
          ) : undefined
        }
      />

      <ErrorBanner error={error} />

      <StatusFilterTabs filters={FILTERS} counts={counts} value={filter} onChange={setFilter} />

      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(p) => p.id}
        emptyMessage="Chưa có đối tác nào trong nhóm này."
      />
    </div>
  );
}

function RowActions({ partner, canApprove }: { partner: PartnerResponse; canApprove: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';

  if (partner.status === 'pending' && canApprove) {
    return (
      <fetcher.Form method="post" className="flex justify-end">
        <input type="hidden" name="id" value={partner.id} />
        <Button type="submit" size="sm" disabled={busy}>
          <Check className="size-4" /> Duyệt
        </Button>
      </fetcher.Form>
    );
  }

  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={`/tenant/partners/${partner.id}`}>
        <Eye className="size-4" /> Xem
      </Link>
    </Button>
  );
}
