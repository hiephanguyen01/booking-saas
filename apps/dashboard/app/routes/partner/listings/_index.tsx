import { useMemo } from 'react';
import { data, Link } from 'react-router';
import { Plus } from 'lucide-react';
import type {
  ListingGroupResponse,
  ListingResponse,
  ListingTypeResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { DataTable } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { buildListingColumns } from '~/features/partner/components/listings/listing-table-columns';
import { ListingGroupCard } from '~/features/partner/components/listings/listing-group-card';
import type { ListingsActionResult } from '~/features/partner/components/listings/types';
import { PageHeader } from '~/components/page-header';
import { ErrorBanner } from '~/components/action-feedback';
import { StatusFilterTabs } from '~/components/status-filter-tabs';
import { useStatusFilter } from '~/hooks/use-status-filter';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tin đăng · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.listings.read');
  const [res, groupsRes, typesRes] = await Promise.all([
    apiGet<ListingResponse[]>('/partner/listings', auth),
    apiGet<ListingGroupResponse[]>('/partner/listing-groups', auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
  ]);
  return {
    listings: res.ok && res.data ? res.data : [],
    groups: groupsRes.data ?? [],
    listingTypes: typesRes.data ?? [],
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
    const res = await apiPost(`/partner/listings/${id}/submit`, {}, auth);
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
  return data<ListingsActionResult>({ ok: false, error: 'Hành động không hợp lệ.' }, { status: 400 });
}

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'published', label: 'Đang hiển thị' },
  { value: 'draft', label: 'Nháp' },
  { value: 'pending_review', label: 'Chờ duyệt' },
  { value: 'archived', label: 'Đã ẩn' },
];

const getStatus = (l: ListingResponse): string => l.status;

export default function PartnerListingsPage({ loaderData }: Route.ComponentProps) {
  const { listings, groups, listingTypes, canWrite, canPublish, canAvailability, loadError } =
    loaderData;

  // Grouped children live in their group's workspace; the table (and the filter
  // counts) only cover standalone listings.
  const standalone = useMemo(() => listings.filter((l) => !l.groupId), [listings]);
  const { filter, setFilter, rows, counts } = useStatusFilter(standalone, getStatus);

  const columns = buildListingColumns({ canWrite, canPublish, canAvailability });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tin đăng"
        description="Tạo, gửi duyệt, hiển thị hoặc ẩn các tin đăng của bạn."
        actions={
          canWrite ? (
            <Button asChild size="sm">
              <Link to="/partner/listings/new">
                <Plus className="size-4" aria-hidden /> Thêm tin đăng
              </Link>
            </Button>
          ) : null
        }
      />

      <StatusFilterTabs filters={FILTERS} counts={counts} value={filter} onChange={setFilter} />

      <ErrorBanner error={loadError} />

      {groups.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <ListingGroupCard
              key={group.id}
              group={group}
              listingType={listingTypes.find((item) => item.id === group.listingTypeId)}
            />
          ))}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(l) => l.id}
        emptyMessage="Chưa có tin đăng độc lập nào."
      />
    </div>
  );
}
