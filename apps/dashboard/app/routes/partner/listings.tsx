import { useMemo, useState } from 'react';
import { data, Link, useFetcher } from 'react-router';
import { Clock, EyeOff, Lock, Pencil, Plus, Send, Undo2 } from 'lucide-react';
import type { BookingMode, ListingGroupResponse, ListingResponse, ListingTypeResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import type { Route } from './+types/listings';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner, canPartner } from './partner.server';
import { PageHeader } from '~/components/page-header';
import { Money } from '~/components/money';
import { EnumValue } from '~/components/enum-value';
import { ListingStatusBadge } from '~/components/status-badge';
import { formatDate } from '~/lib/format';
import { listingPriceFrom } from './listing-price';

/** Booking-mode → Vietnamese label (exhaustive, so a new mode is a compile error). */
const BOOKING_MODE_LABEL: Record<BookingMode, string> = {
  hourly: 'Theo giờ',
  daily: 'Theo ngày',
  appointment: 'Lịch hẹn',
  class: 'Lớp học',
  inventory: 'Theo kho',
};

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tin đăng · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.listings.read')) {
    throw new Response('Không có quyền xem tin đăng.', { status: 403 });
  }
  const [res, groupsRes, typesRes] = await Promise.all([
    apiGet<ListingResponse[]>('/partner/listings', auth),
    apiGet<ListingGroupResponse[]>('/partner/listing-groups', auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
  ]);
  return {
    listings: res.ok && res.data ? res.data : [],
    groups: groupsRes.data ?? [],
    listingTypes: typesRes.data ?? [],
    canWrite: canPartner(membership, 'partner.listings.write'),
    canPublish: canPartner(membership, 'partner.listings.publish'),
    canAvailability: canPartner(membership, 'partner.availability.manage'),
    loadError: res.ok ? null : (res.error ?? 'Không tải được tin đăng.'),
  };
}

/** A listing whose calendar is time-window based (opening hours apply). */
function usesOpeningHours(listing: ListingResponse): boolean {
  return listing.bookingModes.some((m) => m === 'hourly' || m === 'daily');
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const intent = String(form.get('intent') ?? '');
  if (!id) return data({ ok: false, error: 'Thiếu mã tin đăng.' }, { status: 400 });

  const publish = (path: string, body: unknown = {}) => apiPost(path, body, auth);

  if (intent === 'submit') {
    if (!canPartner(membership, 'partner.listings.write')) {
      return data({ ok: false, error: 'Không có quyền gửi duyệt.' }, { status: 403 });
    }
    const res = await publish(`/partner/listings/${id}/submit`);
    return res.ok ? data({ ok: true, error: null }) : data({ ok: false, error: res.error ?? 'Gửi duyệt không thành công.' }, { status: 400 });
  }
  if (intent === 'hide' || intent === 'republish') {
    if (!canPartner(membership, 'partner.listings.publish')) {
      return data({ ok: false, error: 'Không có quyền xuất bản.' }, { status: 403 });
    }
    const res = await publish(`/partner/listings/${id}/${intent}`);
    return res.ok
      ? data({ ok: true, error: null })
      : data({ ok: false, error: res.error ?? 'Thao tác không thành công.' }, { status: 400 });
  }
  return data({ ok: false, error: 'Hành động không hợp lệ.' }, { status: 400 });
}

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'published', label: 'Đang hiển thị' },
  { value: 'draft', label: 'Nháp' },
  { value: 'pending_review', label: 'Chờ duyệt' },
  { value: 'archived', label: 'Đã ẩn' },
];

export default function PartnerListingsPage({ loaderData }: Route.ComponentProps) {
  const { listings, groups, listingTypes, canWrite, canPublish, canAvailability, loadError } = loaderData;
  const [filter, setFilter] = useState<string>('all');

  const rows = useMemo(
    () => (filter === 'all' ? listings : listings.filter((l) => l.status === filter)),
    [listings, filter],
  );

  const columns: DataTableColumn<ListingResponse>[] = [
    {
      header: 'Tin đăng',
      cell: (l) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{l.title}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">/{l.slug}</p>
        </div>
      ),
    },
    {
      header: 'Hình thức',
      cell: (l) => (
        <div className="flex flex-wrap gap-1">
          {l.bookingModes.map((m) => (
            <Badge key={m} variant="outline" className="font-normal">
              <EnumValue map={BOOKING_MODE_LABEL} value={m} />
            </Badge>
          ))}
        </div>
      ),
    },
    {
      header: 'Giá từ',
      cell: (l) => {
        const price = listingPriceFrom(l);
        return price ? (
          <Money value={price} />
        ) : (
          <span className="text-sm text-muted-foreground">Chưa có giá</span>
        );
      },
    },
    {
      header: 'Cập nhật',
      cell: (l) => <span className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(l.updatedAt)}</span>,
    },
    {
      header: 'Trạng thái',
      cell: (l) => {
        const adminLocked = l.status === 'archived' && l.hiddenBy === 'admin';
        return (
          <div className="flex items-center gap-1.5">
            <ListingStatusBadge status={l.status} />
            {adminLocked ? (
              <span className="inline-flex items-center gap-1 text-xs text-warning" title="Bị quản trị viên ẩn">
                <Lock className="size-3" aria-hidden /> Khoá
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (l) => (
        <RowActions
          listing={l}
          canWrite={canWrite}
          canPublish={canPublish}
          canAvailability={canAvailability}
        />
      ),
    },
  ];

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

      <div className="w-full max-w-xs">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      {groups.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => {
            const type = listingTypes.find((item) => item.id === group.listingTypeId);
            return (
              <Link
                key={group.id}
                to={`/partner/listing-groups/${group.id}`}
                className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate">{group.title}</CardTitle>
                        <CardDescription>
                          {type?.name ?? 'Bài đăng'} · {group.listingCount}{' '}
                          {type?.itemLabel || 'hạng mục'}
                        </CardDescription>
                      </div>
                      <ListingStatusBadge status={group.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {group.description || 'Chưa có mô tả.'}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Giá từ </span>
                      {group.priceFrom ? (
                        <Money value={group.priceFrom} className="font-medium" />
                      ) : (
                        <span className="text-muted-foreground">Chưa có giá</span>
                      )}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={rows.filter((listing) => !listing.groupId)}
        getRowKey={(l) => l.id}
        emptyMessage="Chưa có tin đăng độc lập nào."
      />
    </div>
  );
}

function RowActions({
  listing,
  canWrite,
  canPublish,
  canAvailability,
}: {
  listing: ListingResponse;
  canWrite: boolean;
  canPublish: boolean;
  canAvailability: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  const adminLocked = listing.status === 'archived' && listing.hiddenBy === 'admin';

  const submit = (intent: string): void => {
    fetcher.submit({ id: listing.id, intent }, { method: 'post' });
  };

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {canAvailability && usesOpeningHours(listing) ? (
        <Button asChild size="xs" variant="ghost" title="Giờ mở cửa">
          <Link to={`/partner/listings/${listing.id}/hours`}>
            <Clock className="size-3.5" aria-hidden /> Giờ mở cửa
          </Link>
        </Button>
      ) : null}

      {canWrite && !adminLocked ? (
        <Button asChild size="xs" variant="ghost" title="Sửa tin đăng">
          <Link to={`/partner/listings/${listing.id}/edit`}>
            <Pencil className="size-3.5" aria-hidden /> Sửa
          </Link>
        </Button>
      ) : null}

      {listing.status === 'draft' && canWrite ? (
        <Button size="xs" variant="outline" disabled={busy} onClick={() => submit('submit')}>
          <Send className="size-3.5" aria-hidden /> Gửi duyệt
        </Button>
      ) : null}
      {listing.status === 'published' && canPublish ? (
        <Button size="xs" variant="outline" disabled={busy} onClick={() => submit('hide')}>
          <EyeOff className="size-3.5" aria-hidden /> Ẩn
        </Button>
      ) : null}
      {listing.status === 'archived' && canPublish ? (
        adminLocked ? (
          <Button size="xs" variant="outline" disabled title="Chỉ quản trị viên mới bỏ ẩn được">
            <Lock className="size-3.5" aria-hidden /> Bị khoá
          </Button>
        ) : (
          <Button size="xs" variant="outline" disabled={busy} onClick={() => submit('republish')}>
            <Undo2 className="size-3.5" aria-hidden /> Đăng lại
          </Button>
        )
      ) : null}
    </div>
  );
}
