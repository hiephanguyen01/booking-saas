import { data, redirect, useSearchParams } from 'react-router';
import {
  submitListingResponseSchema,
  uuidSchema,
  type ListingGroupResponse,
  type ListingResponse,
  type ListingTypeResponse,
  type Paginated,
  type PaginatedWithCounts,
  type PartnerListingFeedItemResponse,
  type PublishStatus,
  type SubmitListingResponse,
} from '@booking/contracts';
import type { Route } from './+types/_index';
import { apiDelete, apiGet, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { buildListingFeedColumns } from '~/features/partner/components/listings/listing-feed-table-columns';
import { buildListingColumns } from '~/features/partner/components/listings/listing-table-columns';
import { buildListingGroupColumns } from '~/features/partner/components/listings/listing-group-table-columns';
import { CreateListingDialog } from '~/features/partner/components/listings/create-listing-dialog';
import type { ListingsActionResult } from '~/features/partner/components/listings/types';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { PageHeader } from '~/components/page-header';
import { hasActiveFilters, type FilterSpec } from '~/lib/list-filters';
import { readListParams } from '~/lib/pagination';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Quản lý bài đăng · Đối tác · BookingOS' }];
}

const STATUS_VALUES: PublishStatus[] = ['published', 'draft', 'pending_review', 'archived'];
const VIEW_VALUES = ['all', 'single', 'grouped'] as const;
type ListingsView = (typeof VIEW_VALUES)[number];

function readFilters(searchParams: URLSearchParams) {
  const statusRaw = searchParams.get('status') ?? '';
  const listingTypeRaw = searchParams.get('listingTypeId') ?? '';
  const listingType = uuidSchema.safeParse(listingTypeRaw);
  const viewRaw = searchParams.get('view');

  return {
    q: searchParams.get('q')?.trim().slice(0, 200) ?? '',
    status: STATUS_VALUES.includes(statusRaw as PublishStatus) ? (statusRaw as PublishStatus) : '',
    listingTypeId: listingType.success ? listingType.data : '',
    view: VIEW_VALUES.includes(viewRaw as ListingsView) ? (viewRaw as ListingsView) : 'all',
  };
}

function buildFilterSpec(listingTypes: ListingTypeResponse[]): FilterSpec {
  return [
    {
      kind: 'enum',
      key: 'status',
      label: 'Hiển thị',
      allLabel: 'Tất cả trạng thái',
      options: [
        { value: 'published', label: 'Đang hiển thị' },
        { value: 'draft', label: 'Bản nháp' },
        { value: 'pending_review', label: 'Chờ duyệt' },
        { value: 'archived', label: 'Đã ẩn' },
      ],
    },
    {
      kind: 'enum',
      key: 'listingTypeId',
      label: 'Danh mục',
      allLabel: 'Tất cả danh mục',
      options: listingTypes.map((type) => ({ value: type.id, label: type.name })),
    },
  ];
}

function listingsHref(searchParams: URLSearchParams, view: ListingsView): string {
  const next = new URLSearchParams();
  for (const key of ['q', 'status', 'listingTypeId', 'pageSize']) {
    const value = searchParams.get(key);
    if (value) next.set(key, value);
  }
  next.set('view', view);
  return `${dashboardPaths.partner.listings}?${next}`;
}

function resetListingsHref(view: ListingsView, pageSize: number): string {
  const next = new URLSearchParams({ view, pageSize: String(pageSize) });
  return `${dashboardPaths.partner.listings}?${next}`;
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.listings.read');
  const listParams = readListParams(url.searchParams);
  const { page, pageSize, toApiQuery } = listParams;
  const filters = readFilters(url.searchParams);
  const query = toApiQuery({
    q: filters.q,
    status: filters.status,
    listingTypeId: filters.listingTypeId,
  });

  const listingsRequest =
    filters.view === 'all'
      ? apiGet<Paginated<PartnerListingFeedItemResponse>>('/partner/listings/feed', auth, { query })
      : filters.view === 'single'
        ? apiGet<PaginatedWithCounts<ListingResponse>>('/partner/listings', auth, {
            query: { ...query, standaloneOnly: true },
          })
        : apiGet<Paginated<ListingGroupResponse>>('/partner/listing-groups', auth, { query });

  const [listingsRes, listingTypesRes] = await Promise.all([
    listingsRequest,
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
  ]);

  if (listingsRes.ok) {
    const total = listingsRes.data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) {
      const next = new URL(url);
      next.searchParams.set('page', String(totalPages));
      throw redirect(`${next.pathname}?${next.searchParams}`);
    }
  }

  return {
    view: filters.view,
    filters: {
      q: filters.q,
      status: filters.status,
      listingTypeId: filters.listingTypeId,
    },
    items: listingsRes.ok ? (listingsRes.data?.items ?? []) : [],
    total: listingsRes.ok ? (listingsRes.data?.total ?? 0) : 0,
    listingTypes: listingTypesRes.ok ? (listingTypesRes.data ?? []) : [],
    listingTypesAvailable: listingTypesRes.ok,
    canWrite: can('partner.listings.write'),
    canPublish: can('partner.listings.publish'),
    canAvailability: can('partner.availability.manage'),
    loadError: !listingsRes.ok
      ? (listingsRes.error ?? 'Không tải được danh sách bài đăng.')
      : !listingTypesRes.ok
        ? (listingTypesRes.error ?? 'Không tải được danh mục bài đăng.')
        : null,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, can } = await requirePartner(request);
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const intent = String(form.get('intent') ?? '');
  const target = form.get('target') === 'group' ? 'group' : 'listing';
  const endpoint = target === 'group' ? '/partner/listing-groups' : '/partner/listings';

  if (!id) {
    return data<ListingsActionResult>({ ok: false, error: 'Thiếu mã bài đăng.' }, { status: 400 });
  }

  if (intent === 'delete') {
    if (!can('partner.listings.write')) {
      return data<ListingsActionResult>({ ok: false, error: 'Không có quyền xóa.' }, { status: 403 });
    }
    const res = await apiDelete(`${endpoint}/${id}`, auth);
    return res.ok
      ? data<ListingsActionResult>({ ok: true, error: null })
      : data<ListingsActionResult>(
          { ok: false, error: res.error ?? 'Không thể xóa bài đăng.' },
          { status: 400 },
        );
  }

  if (intent === 'submit') {
    if (!can('partner.listings.write')) {
      return data<ListingsActionResult>(
        { ok: false, error: 'Không có quyền gửi duyệt.' },
        { status: 403 },
      );
    }
    const res =
      target === 'listing'
        ? await apiPost<SubmitListingResponse>(`${endpoint}/${id}/submit`, {}, auth, {
            schema: submitListingResponseSchema,
          })
        : await apiPost(`${endpoint}/${id}/submit`, {}, auth);
    return res.ok
      ? data<ListingsActionResult>({ ok: true, error: null })
      : data<ListingsActionResult>(
          { ok: false, error: res.error ?? 'Gửi duyệt không thành công.' },
          { status: 400 },
        );
  }

  if (intent === 'hide' || intent === 'republish') {
    if (!can('partner.listings.publish')) {
      return data<ListingsActionResult>(
        { ok: false, error: 'Không có quyền thay đổi hiển thị.' },
        { status: 403 },
      );
    }
    const res = await apiPost(`${endpoint}/${id}/${intent}`, {}, auth);
    return res.ok
      ? data<ListingsActionResult>({ ok: true, error: null })
      : data<ListingsActionResult>(
          { ok: false, error: res.error ?? 'Thao tác không thành công.' },
          { status: 400 },
        );
  }

  return data<ListingsActionResult>({ ok: false, error: 'Hành động không hợp lệ.' }, { status: 400 });
}

export default function PartnerListingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const {
    view,
    filters,
    items,
    total,
    listingTypes,
    listingTypesAvailable,
    canWrite,
    canPublish,
    canAvailability,
    loadError,
  } = loaderData;
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref } = readListParams(searchParams);
  const filterSpec = buildFilterSpec(listingTypes);
  const hasFilters = hasActiveFilters(filters);
  const actionError = actionData?.error ?? null;
  const tabs = {
    activeValue: view,
    ariaLabel: 'Kiểu bài đăng',
    items: [
      { value: 'all', label: 'Tất cả', href: listingsHref(searchParams, 'all') },
      { value: 'single', label: 'Tin đăng đơn', href: listingsHref(searchParams, 'single') },
      { value: 'grouped', label: 'Tin đăng nhiều hạng mục', href: listingsHref(searchParams, 'grouped') },
    ],
  };
  const resetHref = resetListingsHref(view, pageSize);
  const tableProps = {
    tabs,
    search: { placeholder: 'Tìm tên bài đăng…' },
    filters: filterSpec,
    filterValues: filters,
    resetHref,
    pageSize,
    enableColumnVisibility: true,
    error: loadError ?? actionError,
    pagination: { page, pageSize, total, hrefFor: pageHref },
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quản lý bài đăng"
        description="Tạo, gửi duyệt và quản lý khả năng hiển thị của bài đăng."
        actions={
          canWrite && listingTypesAvailable ? <CreateListingDialog listingTypes={listingTypes} /> : null
        }
      />
heck      {view === 'all' ? (
        <DashboardDataTable
          {...tableProps}
          key="all"
          columns={buildListingFeedColumns({ listingTypes, canWrite, canPublish, canAvailability })}
          data={items as PartnerListingFeedItemResponse[]}
          getRowKey={(entry) => `${entry.kind}:${entry.item.id}`}
          emptyMessage={hasFilters ? 'Không có bài đăng khớp bộ lọc.' : 'Chưa có bài đăng nào.'}
        />
      ) : view === 'single' ? (
        <DashboardDataTable
          {...tableProps}
          key="single"
          columns={buildListingColumns({ listingTypes, canWrite, canPublish, canAvailability })}
          data={items as ListingResponse[]}
          getRowKey={(listing) => listing.id}
          emptyMessage={hasFilters ? 'Không có bài đăng đơn khớp bộ lọc.' : 'Chưa có bài đăng đơn nào.'}
        />
      ) : (
        <DashboardDataTable
          {...tableProps}
          key="grouped"
          columns={buildListingGroupColumns({ listingTypes, canWrite, canPublish })}
          data={items as ListingGroupResponse[]}
          getRowKey={(group) => group.id}
          emptyMessage={hasFilters ? 'Không có bài đăng nhóm khớp bộ lọc.' : 'Chưa có bài đăng nhóm nào.'}
        />
      )}
    </div>
  );
}
