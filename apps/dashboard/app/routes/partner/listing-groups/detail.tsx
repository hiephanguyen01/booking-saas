import { data, Link, redirect, useFetcher } from 'react-router';
import {
  CalendarCheck,
  CalendarClock,
  Copy,
  EyeOff,
  Info,
  Layers3,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Star,
  Trash2,
} from 'lucide-react';
import type {
  ListingGroupDetailResponse,
  ListingResponse,
  ListingTypeResponse,
  PublishStatus,
} from '@booking/contracts';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@booking/ui/components/ui/alert-dialog';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { Progress } from '@booking/ui/components/ui/progress';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/detail';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { apiDelete, apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { MODERATION_ACTOR_LABEL } from '~/constants/listing';
import { PageHeader } from '~/components/page-header';
import { StatCard } from '~/components/stat-card';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { EntityRef } from '~/components/entity-ref';
import { PhotoStrip } from '~/components/photo-strip';
import { CopyableCode } from '~/components/copyable-code';
import { ListingStatusBadge } from '~/components/status-badge';
import { formatNumber } from '~/lib/format';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { listingPriceFrom } from '~/lib/listing-price';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request);
  const [groupRes, typesRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(`/partner/listing-groups/${params.groupId}`, auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
  ]);
  if (!groupRes.ok || !groupRes.data)
    throw new Response('Không tìm thấy bài đăng.', { status: groupRes.status });
  return {
    group: groupRes.data,
    listingType:
      (typesRes.data ?? []).find((type) => type.id === groupRes.data?.listingTypeId) ?? null,
    canWrite: can('partner.listings.write'),
    canPublish: can('partner.listings.publish'),
    canAvailability: can('partner.availability.manage'),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, can } = await requirePartner(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const canWrite = can('partner.listings.write');
  const canPublish = can('partner.listings.publish');

  if (
    ['submit', 'reopen', 'delete-group', 'delete-child', 'duplicate-child'].includes(intent) &&
    !canWrite
  ) {
    return data({ ok: false, error: 'Không có quyền thay đổi bài đăng.' }, { status: 403 });
  }
  if (['hide', 'republish'].includes(intent) && !canPublish) {
    return data({ ok: false, error: 'Không có quyền hiển thị hoặc ẩn bài đăng.' }, { status: 403 });
  }
  if (intent === 'submit') {
    const res = await apiPost(`/partner/listing-groups/${params.groupId}/submit`, {}, auth);
    return res.ok
      ? data({ ok: true, error: null })
      : data({ ok: false, error: res.error ?? 'Gửi duyệt không thành công.' }, { status: 400 });
  }
  if (intent === 'hide' || intent === 'republish') {
    const res = await apiPost(`/partner/listing-groups/${params.groupId}/${intent}`, {}, auth);
    return res.ok
      ? data({ ok: true, error: null })
      : data({ ok: false, error: res.error ?? 'Thao tác không thành công.' }, { status: 400 });
  }
  if (intent === 'reopen') {
    // Updating an archived group intentionally moves the group and all children
    // back to draft in the API, making item editing available again.
    const res = await apiPatch(`/partner/listing-groups/${params.groupId}`, {}, auth);
    return res.ok
      ? data({ ok: true, error: null })
      : data(
          { ok: false, error: res.error ?? 'Không thể chuyển bài đăng về bản nháp.' },
          { status: 400 },
        );
  }
  if (intent === 'delete-group') {
    const res = await apiDelete(`/partner/listing-groups/${params.groupId}`, auth);
    if (!res.ok)
      return data(
        { ok: false, error: res.error ?? 'Xóa bài đăng không thành công.' },
        { status: 400 },
      );
    return redirect('/partner/listings');
  }
  if (intent === 'delete-child') {
    const listingId = String(form.get('listingId') ?? '');
    const res = await apiDelete(`/partner/listings/${listingId}`, auth);
    return res.ok
      ? data({ ok: true, error: null })
      : data({ ok: false, error: res.error ?? 'Xóa hạng mục không thành công.' }, { status: 400 });
  }
  if (intent === 'duplicate-child') {
    const listingId = String(form.get('listingId') ?? '');
    const source = await apiGet<ListingResponse>(`/partner/listings/${listingId}`, auth);
    if (!source.ok || !source.data || source.data.groupId !== params.groupId)
      return data({ ok: false, error: 'Không tìm thấy hạng mục cần nhân bản.' }, { status: 404 });
    const stamp = Date.now().toString(36);
    const listing = source.data;
    if (!listing.provinceCode || !listing.wardCode || !listing.address) {
      return data(
        { ok: false, error: 'Vui lòng cập nhật địa chỉ hạng mục trước khi nhân bản.' },
        { status: 400 },
      );
    }
    const res = await apiPost(
      '/partner/listings',
      {
        partnerId: listing.partnerId,
        listingTypeId: listing.listingTypeId,
        groupId: listing.groupId ?? undefined,
        categoryId: listing.categoryId ?? undefined,
        title: `${listing.title} (bản sao)`,
        slug: `${listing.slug}-copy-${stamp}`,
        description: listing.description ?? undefined,
        provinceCode: listing.provinceCode,
        wardCode: listing.wardCode,
        address: listing.address,
        photos: listing.photos,
        attributes: listing.attributes,
        bookingModes: listing.bookingModes,
        modeConfig: listing.modeConfig,
        stockQuantity: listing.stockQuantity ?? undefined,
        capacity: listing.capacity ?? undefined,
        bufferBefore: listing.bufferBefore,
        bufferAfter: listing.bufferAfter,
        approvalRequired: listing.approvalRequired,
        depositPercent: listing.depositPercent,
        balanceDue: listing.balanceDue,
        cancellationPolicyId: listing.cancellationPolicyId ?? undefined,
      },
      auth,
    );
    return res.ok
      ? data({ ok: true, error: null })
      : data(
          { ok: false, error: res.error ?? 'Nhân bản hạng mục không thành công.' },
          { status: 400 },
        );
  }
  return data({ ok: false, error: 'Hành động không hợp lệ.' }, { status: 400 });
}

const STATUS_META: Record<PublishStatus, { label: string; title: string; description: string }> = {
  draft: {
    label: 'Nháp',
    title: 'Bài đăng đang ở bản nháp',
    description: 'Bạn có thể thêm, sửa, nhân bản hoặc xóa hạng mục trước khi gửi duyệt.',
  },
  pending_review: {
    label: 'Chờ duyệt',
    title: 'Bài đăng đang chờ duyệt',
    description: 'Nội dung tạm thời chỉ đọc trong lúc quản trị viên xem xét.',
  },
  published: {
    label: 'Đang hiển thị',
    title: 'Bài đăng đang hiển thị',
    description:
      'Bạn vẫn có thể quản lý giờ hoạt động. Hãy ẩn bài đăng trước khi sửa nội dung hạng mục.',
  },
  archived: {
    label: 'Đã ẩn',
    title: 'Bài đăng đang được ẩn',
    description: 'Chuyển về bản nháp để sửa hạng mục, hoặc đăng lại nội dung hiện tại.',
  },
};

function usesOpeningHours(listing: ListingResponse): boolean {
  return listing.bookingModes.some((mode) => mode === 'hourly' || mode === 'daily');
}

/** Who published / hid the post — an em dash never leaks a raw slug. */
/** Booking-mode → Vietnamese label (exhaustive, so a new mode is a compile error). */

/** Full address line from the group's stored address snapshot. */
function addressLine(group: ListingGroupDetailResponse): string {
  return [group.address, group.wardName, group.provinceName].filter(Boolean).join(', ');
}

/** A child's price (Money) or the muted "Chưa có giá" when none is configured. */
function ChildPrice({ listing }: { listing: ListingResponse }) {
  const price = listingPriceFrom(listing);
  return price ? (
    <Money value={price} />
  ) : (
    <span className="text-muted-foreground">Chưa có giá</span>
  );
}

export default function ListingGroupWorkspace({ loaderData, actionData }: Route.ComponentProps) {
  const { group, canWrite, canPublish, canAvailability } = loaderData;
  const itemLabel = group.itemLabel;
  const statusMeta = STATUS_META[group.status];
  const adminLocked = group.status === 'archived' && group.hiddenBy === 'admin';
  const canEditItems = canWrite && group.status === 'draft';
  const readyPct =
    group.listingCount > 0 ? Math.round((group.readyListingCount / group.listingCount) * 100) : 0;
  const columns: DataTableColumn<ListingResponse>[] = [
    {
      header: itemLabel,
      cell: (listing) => (
        <div className="flex min-w-0 items-center gap-3">
          {listing.photos[0] ? (
            <img
              src={listing.photos[0]}
              alt={listing.title}
              className="size-12 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="size-12 shrink-0 rounded-md bg-muted" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">
              {canEditItems ? (
                <EntityRef
                  to={`/partner/listing-groups/${group.id}/listings/${listing.id}/edit`}
                  name={listing.title}
                />
              ) : (
                listing.title
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">/{listing.slug}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Hình thức',
      cell: (listing) => (
        <div className="flex flex-wrap gap-1">
          {listing.bookingModes.map((mode) => (
            <Badge key={mode} variant="outline" className="font-normal">
              <EnumValue map={BOOKING_MODE_LABEL} value={mode} />
            </Badge>
          ))}
        </div>
      ),
    },
    { header: 'Trạng thái', cell: (listing) => <ListingStatusBadge status={listing.status} /> },
    { header: 'Giá từ', cell: (listing) => <ChildPrice listing={listing} /> },
    {
      header: 'Cọc / Kho',
      cell: (listing) => (
        <div className="text-sm">
          <span>Cọc {listing.depositPercent}%</span>
          {listing.stockQuantity != null ? (
            <span className="block text-xs text-muted-foreground">
              Kho: {formatNumber(listing.stockQuantity)}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      header: 'Thao tác',
      className: 'text-right',
      headClassName: 'text-right',
      cell: (listing) => (
        <GroupedListingActions
          groupId={group.id}
          listing={listing}
          itemLabel={itemLabel}
          canEdit={canEditItems}
          canManageHours={canAvailability && usesOpeningHours(listing)}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={group.title}
        description={`${loaderData.listingType?.name ?? 'Bài đăng'} · ${group.listingCount} ${itemLabel}`}
        actions={
          <>
            <ListingStatusBadge status={group.status} />
            {canWrite && ['draft', 'archived'].includes(group.status) && !adminLocked ? (
              <Button asChild variant="outline" size="sm">
                <Link to={`/partner/listing-groups/${group.id}/edit`}>
                  <Pencil data-icon="inline-start" /> Sửa thông tin chung
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {actionData?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{actionData.error}</AlertDescription>
        </Alert>
      ) : null}
      <Alert>
        {adminLocked ? <Lock /> : <Info />}
        <AlertTitle>{adminLocked ? 'Bài đăng bị quản trị viên ẩn' : statusMeta.title}</AlertTitle>
        <AlertDescription>
          <p>
            {adminLocked
              ? 'Bạn có thể xem nội dung và quản lý giờ hoạt động, nhưng chỉ quản trị viên mới có thể bỏ ẩn bài đăng.'
              : statusMeta.description}
          </p>
          <GroupLifecycleActions
            group={group}
            canWrite={canWrite}
            canPublish={canPublish}
            adminLocked={adminLocked}
          />
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>Tổng quan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <DetailGrid columns={3}>
            <DetailField
              label="Đường dẫn"
              value={<CopyableCode value={`/${group.slug}`} label="đường dẫn" />}
            />
            <DetailField
              label="Giá từ"
              emphasis="strong"
              value={group.priceFrom ? <Money value={group.priceFrom} /> : undefined}
            />
            <DetailField label="Trạng thái" value={<ListingStatusBadge status={group.status} />} />
            <DetailField label="Ngày tạo" value={<DateTimeValue iso={group.createdAt} />} />
            <DetailField
              label="Cập nhật"
              value={<DateTimeValue iso={group.updatedAt} relative />}
            />
            <DetailField
              label="Xuất bản bởi"
              omitWhenEmpty
              value={
                group.publishedBy ? (
                  <EnumValue map={MODERATION_ACTOR_LABEL} value={group.publishedBy} />
                ) : undefined
              }
            />
            <DetailField
              label="Ẩn bởi"
              omitWhenEmpty
              value={
                group.hiddenBy ? (
                  <EnumValue map={MODERATION_ACTOR_LABEL} value={group.hiddenBy} />
                ) : undefined
              }
            />
          </DetailGrid>
          <DetailSection
            title="Tiến độ"
            description={`${group.readyListingCount}/${group.listingCount} ${itemLabel} đạt mức sẵn sàng (đủ ảnh, mô tả và giá).`}
          >
            <div className="space-y-1.5">
              <Progress value={readyPct} />
              <p className="text-xs text-muted-foreground">{readyPct}% hoàn thiện</p>
            </div>
          </DetailSection>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Nội dung</CardTitle>
          <CardDescription>Album và thông tin dùng chung cho toàn bộ bài đăng.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DetailSection title="Ảnh" emptyMessage="Chưa có ảnh.">
            {group.photos.length ? <PhotoStrip photos={group.photos} alt={group.title} /> : null}
          </DetailSection>
          <DetailSection title="Mô tả" emptyMessage="Chưa có mô tả.">
            {group.description ? (
              <p className="whitespace-pre-wrap text-sm">{group.description}</p>
            ) : null}
          </DetailSection>
          <DetailGrid>
            <DetailField label="Khu vực hoạt động" value={group.workingArea} />
            <DetailField label="Địa chỉ" value={addressLine(group) || undefined} />
          </DetailGrid>
          <DetailSection title="Tiện ích" emptyMessage="Chưa có tiện ích.">
            {group.amenities.length ? (
              <div className="flex flex-wrap gap-2">
                {group.amenities.map((amenity) => (
                  <Badge key={amenity} variant="secondary">
                    {amenity}
                  </Badge>
                ))}
              </div>
            ) : null}
          </DetailSection>
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="capitalize">{itemLabel} & giá</CardTitle>
              <CardDescription>
                Những lựa chọn khách hàng có thể đặt trong bài đăng này.
              </CardDescription>
            </div>
            {canEditItems ? (
              <Button asChild size="sm">
                <Link to={`/partner/listing-groups/${group.id}/listings/new`}>
                  <Plus data-icon="inline-start" /> Thêm {itemLabel}
                </Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {group.listings.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Layers3 />
                  </EmptyMedia>
                  <EmptyTitle>Chưa có {itemLabel} nào</EmptyTitle>
                  <EmptyDescription>
                    Thêm ít nhất một {itemLabel} mà khách hàng có thể chọn và đặt.
                  </EmptyDescription>
                </EmptyHeader>
                {canEditItems ? (
                  <EmptyContent>
                    <Button asChild>
                      <Link to={`/partner/listing-groups/${group.id}/listings/new`}>
                        <Plus data-icon="inline-start" /> Thêm {itemLabel}
                      </Link>
                    </Button>
                  </EmptyContent>
                ) : null}
              </Empty>
            ) : (
              <>
                <div className="hidden md:block">
                  <DataTable
                    columns={columns}
                    data={group.listings}
                    getRowKey={(listing) => listing.id}
                  />
                </div>
                <div className="grid gap-3 md:hidden">
                  {group.listings.map((listing) => (
                    <GroupedListingCard
                      key={listing.id}
                      groupId={group.id}
                      listing={listing}
                      itemLabel={itemLabel}
                      canEdit={canEditItems}
                      canManageHours={canAvailability && usesOpeningHours(listing)}
                    />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Kiểm tra</CardTitle>
            <CardDescription>
              {group.readyListingCount}/{group.listingCount} {itemLabel} sẵn sàng.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2 text-sm">
              <li>
                Thông tin chung:{' '}
                {group.description && group.photos.length ? 'Đã đủ' : 'Cần bổ sung'}
              </li>
              <li>
                Ít nhất một {itemLabel}: {group.listingCount ? 'Đã có' : 'Chưa có'}
              </li>
              <li>
                Nội dung {itemLabel}:{' '}
                {group.readyListingCount === group.listingCount && group.listingCount
                  ? 'Đã đủ'
                  : 'Cần bổ sung'}
              </li>
            </ul>
            {canWrite && group.status === 'draft' ? (
              <SubmitGroupButton disabled={!group.listingCount} />
            ) : null}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Đánh giá trung bình"
          value={group.ratingAvg != null ? group.ratingAvg.toFixed(1) : '—'}
          hint={group.ratingAvg != null ? 'trên 5 sao' : 'Chưa có đánh giá'}
          icon={<Star className="size-4" aria-hidden />}
        />
        <StatCard
          label="Lượt đặt"
          value={formatNumber(group.bookingCount)}
          hint="Tổng lượt đặt của bài đăng"
          icon={<CalendarCheck className="size-4" aria-hidden />}
        />
      </div>
    </div>
  );
}

function SubmitGroupButton({ disabled }: { disabled: boolean }) {
  const fetcher = useFetcher<typeof action>();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        disabled={disabled || fetcher.state !== 'idle'}
        onClick={() => fetcher.submit({ intent: 'submit' }, { method: 'post' })}
      >
        <Send data-icon="inline-start" /> Gửi duyệt
      </Button>
      {fetcher.data?.error ? (
        <p className="text-xs text-destructive" role="alert">
          {fetcher.data.error}
        </p>
      ) : null}
    </div>
  );
}

function GroupLifecycleActions({
  group,
  canWrite,
  canPublish,
  adminLocked,
}: {
  group: ListingGroupDetailResponse;
  canWrite: boolean;
  canPublish: boolean;
  adminLocked: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  const submit = (intent: string) => fetcher.submit({ intent }, { method: 'post' });

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {group.status === 'published' && canPublish ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => submit('hide')}>
          <EyeOff /> Ẩn để chỉnh sửa
        </Button>
      ) : null}
      {group.status === 'archived' && canWrite && !adminLocked ? (
        <Button size="sm" disabled={busy} onClick={() => submit('reopen')}>
          <Pencil /> Chuyển về bản nháp
        </Button>
      ) : null}
      {group.status === 'archived' && canPublish && !adminLocked ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => submit('republish')}>
          <RotateCcw /> Đăng lại
        </Button>
      ) : null}
      {['draft', 'archived'].includes(group.status) &&
      canWrite &&
      group.listingCount === 0 &&
      !adminLocked ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 /> Xóa bài đăng
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa bài đăng?</AlertDialogTitle>
              <AlertDialogDescription>Thao tác này không thể hoàn tác.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={() => submit('delete-group')}>
                Xóa bài đăng
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {fetcher.data?.error ? (
        <p className="basis-full text-sm text-destructive" role="alert">
          {fetcher.data.error}
        </p>
      ) : null}
    </div>
  );
}

function GroupedListingCard({
  groupId,
  listing,
  itemLabel,
  canEdit,
  canManageHours,
}: {
  groupId: string;
  listing: ListingResponse;
  itemLabel: string;
  canEdit: boolean;
  canManageHours: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 gap-3">
        {listing.photos[0] ? (
          <img
            src={listing.photos[0]}
            alt={listing.title}
            className="size-16 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="size-16 shrink-0 rounded-md bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-medium">
              {canEdit ? (
                <EntityRef
                  to={`/partner/listing-groups/${groupId}/listings/${listing.id}/edit`}
                  name={listing.title}
                />
              ) : (
                listing.title
              )}
            </p>
            <ListingStatusBadge status={listing.status} />
          </div>
          <p className="truncate text-xs text-muted-foreground">/{listing.slug}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {listing.bookingModes.map((mode) => (
              <Badge key={mode} variant="outline" className="font-normal">
                <EnumValue map={BOOKING_MODE_LABEL} value={mode} />
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Giá từ</p>
          <p className="text-sm font-medium">
            <ChildPrice listing={listing} />
          </p>
        </div>
        <div className="text-right text-sm">
          <span>Cọc {listing.depositPercent}%</span>
          {listing.stockQuantity != null ? (
            <span className="block text-xs text-muted-foreground">
              Kho: {formatNumber(listing.stockQuantity)}
            </span>
          ) : null}
        </div>
      </div>
      <GroupedListingActions
        groupId={groupId}
        listing={listing}
        itemLabel={itemLabel}
        canEdit={canEdit}
        canManageHours={canManageHours}
      />
    </div>
  );
}

function GroupedListingActions({
  groupId,
  listing,
  itemLabel,
  canEdit,
  canManageHours,
}: {
  groupId: string;
  listing: ListingResponse;
  itemLabel: string;
  canEdit: boolean;
  canManageHours: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        {canManageHours ? (
          <Button asChild size="xs" variant="ghost">
            <Link to={`/partner/listings/${listing.id}/hours`} title="Giờ hoạt động">
              <CalendarClock /> Giờ hoạt động
            </Link>
          </Button>
        ) : null}
        {canEdit ? (
          <Button asChild size="xs" variant="ghost">
            <Link
              to={`/partner/listing-groups/${groupId}/listings/${listing.id}/edit`}
              title={`Sửa ${itemLabel}`}
            >
              <Pencil /> Sửa
            </Link>
          </Button>
        ) : null}
        <Button
          size="xs"
          variant="ghost"
          disabled={!canEdit || busy}
          title={`Nhân bản ${itemLabel}`}
          onClick={() =>
            fetcher.submit({ intent: 'duplicate-child', listingId: listing.id }, { method: 'post' })
          }
        >
          <Copy /> Nhân bản
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="xs"
              variant="ghost"
              disabled={!canEdit || busy}
              className="text-destructive hover:text-destructive"
              title={`Xóa ${itemLabel}`}
            >
              <Trash2 /> Xóa
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa {itemLabel}?</AlertDialogTitle>
              <AlertDialogDescription>Thao tác này không thể hoàn tác.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={() =>
                  fetcher.submit(
                    { intent: 'delete-child', listingId: listing.id },
                    { method: 'post' },
                  )
                }
              >
                Xóa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {fetcher.data?.error ? (
        <p className="max-w-64 text-right text-xs text-destructive" role="alert">
          {fetcher.data.error}
        </p>
      ) : null}
    </div>
  );
}
