import { Link, useFetcher, useSearchParams, data as routeData } from 'react-router';
import type { PartnerResponse, PaginatedWithCounts, PartnerStatus } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Badge } from '@booking/ui/components/ui/badge';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Check, Eye, Plus } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { formatDate } from '~/lib/format';
import { PARTNER_TYPE_LABEL as TYPE_LABEL } from '~/constants/partner';
import { PageHeader } from '~/components/page-header';
import { PartnerStatusBadge, PartnerVerificationBadge } from '~/components/status-badge';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { PhoneLink } from '~/components/contact-link';
import { ErrorBanner } from '~/components/action-feedback';
import { readListParams } from '~/lib/pagination';
import { readListFilters, hasActiveFilters, type FilterSpec } from '~/lib/list-filters';
import { dashboardPaths } from '~/constants/paths';
import { apiPaths } from '~/constants/api-paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Đối tác · Tenant · BookingOS' }];
}

const STATUS_VALUES: PartnerStatus[] = ['pending', 'approved', 'suspended'];

const PARTNERS_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Tên hoặc slug đối tác…' },
];

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.partners.read');
  const { toApiQuery } = readListParams(url.searchParams);
  const statusRaw = url.searchParams.get('status') ?? '';
  const status = STATUS_VALUES.includes(statusRaw as PartnerStatus) ? statusRaw : '';
  const { filters, apiFilters } = readListFilters(url.searchParams, PARTNERS_FILTER_SPEC);
  const res = await apiGet<PaginatedWithCounts<PartnerResponse>>(apiPaths.tenant.partners, auth, {
    query: toApiQuery({ status, ...apiFilters }),
  });
  return {
    result: res.ok ? res.data : null,
    error: res.ok ? null : (res.error ?? 'Không tải được danh sách đối tác.'),
    filters: { status, ...filters },
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
  const res = await apiPost(apiPaths.tenant.partnerApprove(id), {}, auth);
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

export default function TenantPartners({ loaderData }: Route.ComponentProps) {
  const { result, error, canApprove, canManage, filters } = loaderData;
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref, filterHref } = readListParams(searchParams);
  const partners = result?.items ?? [];
  const total = result?.total ?? 0;
  const counts = result?.counts;
  const statusValue = filters.status || 'all';

  const columns: DataTableColumn<PartnerResponse>[] = [
    {
      header: 'Đối tác',
      cell: (p) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link to={dashboardPaths.tenant.partner(p.id)} className="truncate font-medium hover:underline">
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
            <Button asChild>
              <Link to={dashboardPaths.tenant.partnerNew}>
                <Plus className="size-4" /> Thêm đối tác nội bộ
              </Link>
            </Button>
          ) : undefined
        }
      />

      <ErrorBanner error={error} />

      <DashboardDataTable
        columns={columns}
        data={partners}
        getRowKey={(partner) => partner.id}
        filters={PARTNERS_FILTER_SPEC}
        filterValues={filters}
        resetHref={dashboardPaths.tenant.partners}
        pageSize={pageSize}
        tabs={{
          activeValue: statusValue,
          ariaLabel: 'Lọc đối tác theo trạng thái',
          items: FILTERS.map((filter) => ({
            value: filter.value,
            href: filterHref({ status: filter.value === 'all' ? undefined : filter.value }),
            label: (
              <span className="inline-flex items-center gap-2">
                {filter.label}
                {counts ? (
                  <span className="rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                    {counts[filter.value] ?? 0}
                  </span>
                ) : null}
              </span>
            ),
          })),
        }}
        emptyMessage={
          hasActiveFilters(filters) ? 'Không có đối tác khớp bộ lọc.' : 'Chưa có đối tác nào trong nhóm này.'
        }
        pagination={{ page, pageSize, total, hrefFor: pageHref }}
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
      <Link to={dashboardPaths.tenant.partner(partner.id)}>
        <Eye className="size-4" /> Xem
      </Link>
    </Button>
  );
}
