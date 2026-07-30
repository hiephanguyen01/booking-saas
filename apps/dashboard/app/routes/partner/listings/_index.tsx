import { data } from 'react-router';
import { useSearchParams } from 'react-router';
import type {
  ListingGroupResponse,
  ListingResponse,
  ListingTypeResponse,
  Paginated,
  PaginatedWithCounts,
  PublishStatus,
  SubmitListingResponse,
} from '@booking/contracts';
import { submitListingResponseSchema } from '@booking/contracts';
import { DataTable } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { buildListingColumns } from '~/features/partner/components/listings/listing-table-columns';
import { buildListingGroupColumns } from '~/features/partner/components/listings/listing-group-table-columns';
import { CreateListingDialog } from '~/features/partner/components/listings/create-listing-dialog';
import type { ListingsActionResult } from '~/features/partner/components/listings/types';
import { PageHeader } from '~/components/page-header';
import { RelationshipHint } from '~/components/relationship-hint';
import { ErrorBanner } from '~/components/action-feedback';
import { StatusFilterTabs } from '~/components/status-filter-tabs';
import { readListParams } from '~/lib/pagination';
import { PaginationBar } from '~/components/pagination-bar';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tin đăng · Đối tác · BookingOS' }];
}

const STATUS_VALUES: PublishStatus[] = ['published', 'draft', 'pending_review', 'archived'];
type ListingsView = 'single' | 'grouped';

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.listings.read');
  const { toApiQuery } = readListParams(url.searchParams);
  const statusRaw = url.searchParams.get('status') ?? '';
  const status = STATUS_VALUES.includes(statusRaw as PublishStatus) ? statusRaw : '';
  const view: ListingsView = url.searchParams.get('view') === 'grouped' ? 'grouped' : 'single';
  const [res, groupsRes, typesRes] = await Promise.all([
    apiGet<PaginatedWithCounts<ListingResponse>>('/partner/listings', auth, {
      query: toApiQuery({ status }),
    }),
    // Groups are few and shown as navigation cards — pull them all (bounded).
    apiGet<Paginated<ListingGroupResponse>>('/partner/listing-groups', auth, {
      query: { pageSize: 100 },
    }),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
  ]);
  return {
    result: res.ok ? res.data : null,
    groups: groupsRes.ok ? (groupsRes.data?.items ?? []) : [],
    listingTypes: typesRes.data ?? [],
    filters: { status },
    view,
    canWrite: can('partner.listings.write'),
    canPublish: can('partner.listings.publish'),
    canAvailability: can('partner.availability.manage'),
    loadError: res.ok ? null : (res.error ?? 'Không tải được tin đăng.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, can } = await requirePartner(request);
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const intent = String(form.get('intent') ?? '');
  if (!id) {
    return data<ListingsActionResult>({ ok: false, error: 'Thiếu mã tin đăng.' }, { status: 400 });
  }

  if (intent === 'submit') {
    if (!can('partner.listings.write')) {
      return data<ListingsActionResult>(
        { ok: false, error: 'Không có quyền gửi duyệt.' },
        { status: 403 },
      );
    }
    const res = await apiPost<SubmitListingResponse>(`/partner/listings/${id}/submit`, {}, auth, {
      schema: submitListingResponseSchema,
    });
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
        { ok: false, error: 'Không có quyền xuất bản.' },
        { status: 403 },
      );
    }
    const res = await apiPost(`/partner/listings/${id}/${intent}`, {}, auth);
    return res.ok
      ? data<ListingsActionResult>({ ok: true, error: null })
      : data<ListingsActionResult>(
          { ok: false, error: res.error ?? 'Thao tác không thành công.' },
          { status: 400 },
        );
  }
  return data<ListingsActionResult>(
    { ok: false, error: 'Hành động không hợp lệ.' },
    { status: 400 },
  );
}

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'published', label: 'Đang hiển thị' },
  { value: 'draft', label: 'Nháp' },
  { value: 'pending_review', label: 'Chờ duyệt' },
  { value: 'archived', label: 'Đã ẩn' },
];

const VIEW_FILTERS: { value: string; label: string }[] = [
  { value: 'single', label: 'Tin đăng đơn' },
  { value: 'grouped', label: 'Tin đăng nhiều hạng mục' },
];

export default function PartnerListingsPage({ loaderData }: Route.ComponentProps) {
  const {
    result,
    groups,
    listingTypes,
    canWrite,
    canPublish,
    canAvailability,
    loadError,
    filters,
    view,
  } = loaderData;
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref, filterHref } = readListParams(searchParams);
  const listings = result?.items ?? [];
  const total = result?.total ?? 0;
  const counts = result?.counts;
  const statusValue = filters.status || 'all';
  const columns = buildListingColumns({ canWrite, canPublish, canAvailability });
  const groupColumns = buildListingGroupColumns({ listingTypes });
  const viewCounts = { single: total, grouped: groups.length };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tin đăng"
        description="Tạo, gửi duyệt, hiển thị hoặc ẩn các tin đăng của bạn."
        actions={canWrite ? <CreateListingDialog listingTypes={listingTypes} /> : null}
      />

      <RelationshipHint variant="listings" />

      <StatusFilterTabs
        filters={VIEW_FILTERS}
        value={view}
        hrefFor={(v) => filterHref({ view: v === 'single' ? undefined : v })}
        counts={viewCounts}
      />

      <ErrorBanner error={loadError} />

      {view === 'grouped' ? (
        <DataTable
          columns={groupColumns}
          data={groups}
          getRowKey={(g) => g.id}
          emptyMessage="Chưa có tin đăng nhiều hạng mục nào."
        />
      ) : (
        <>
          <StatusFilterTabs
            filters={FILTERS}
            value={statusValue}
            hrefFor={(v) => filterHref({ status: v === 'all' ? undefined : v })}
            counts={counts}
          />
          <DataTable
            columns={columns}
            data={listings}
            getRowKey={(l) => l.id}
            emptyMessage="Chưa có tin đăng nào."
          />
          <PaginationBar page={page} pageSize={pageSize} total={total} hrefFor={pageHref} />
        </>
      )}
    </div>
  );
}
