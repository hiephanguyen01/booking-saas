import { Link } from 'react-router';
import { CalendarCheck, Layers3, Pencil, Plus, Star } from 'lucide-react';
import type { ListingGroupDetailResponse, ListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Progress } from '@booking/ui/components/ui/progress';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { DataTable } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/detail';
import { apiGet } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { runListingGroupAction } from '~/features/partner/server/listing-groups.server';
import {
  GroupStatusAlert,
  isAdminLocked,
  SubmitGroupButton,
} from '~/features/partner/components/listing-groups/listing-group-lifecycle';
import {
  buildGroupedListingColumns,
  GroupedListingCard,
} from '~/features/partner/components/listing-groups/grouped-listing-item';
import {
  ListingGroupContentCard,
  ListingGroupOverviewCard,
} from '~/features/partner/components/listing-groups/listing-group-summary';
import { PageHeader } from '~/components/page-header';
import { StatCard } from '~/components/stat-card';
import { ErrorBanner } from '~/components/action-feedback';
import { ListingStatusBadge } from '~/components/status-badge';
import { formatNumber } from '~/lib/format';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request);
  const [groupRes, typesRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(`/partner/listing-groups/${params.groupId}`, auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
  ]);
  if (!groupRes.ok || !groupRes.data)
    throw new Response('Không tìm thấy tin đăng.', { status: groupRes.status });
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
  return runListingGroupAction({ request, groupId: params.groupId, auth, can });
}

export default function ListingGroupWorkspace({ loaderData, actionData }: Route.ComponentProps) {
  const { group, canWrite, canPublish, canAvailability } = loaderData;
  const itemLabel = group.itemLabel;
  const adminLocked = isAdminLocked(group);
  const canEditItems = canWrite && group.status === 'draft';
  const readyPct =
    group.listingCount > 0 ? Math.round((group.readyListingCount / group.listingCount) * 100) : 0;
  const columns = buildGroupedListingColumns({
    groupId: group.id,
    itemLabel,
    canEdit: canEditItems,
    canWrite,
    canAvailability,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={group.title}
        description={`${loaderData.listingType?.name ?? 'Tin đăng'} · ${group.listingCount} ${itemLabel}`}
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
      <ErrorBanner error={actionData?.error} />
      <GroupStatusAlert group={group} canWrite={canWrite} canPublish={canPublish} />
      <ListingGroupOverviewCard group={group} />
      <ListingGroupContentCard group={group} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="capitalize">{itemLabel} & giá</CardTitle>
              <CardDescription>
                Những lựa chọn khách hàng có thể đặt trong tin đăng này.
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
                      canManageCalendar={canWrite || canAvailability}
                    />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Kiểm tra trước khi gửi duyệt</CardTitle>
            <CardDescription>
              {group.readyListingCount}/{group.listingCount} {itemLabel} đạt mức sẵn sàng (đủ ảnh,
              mô tả và giá).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Progress value={readyPct} />
              <p className="text-xs text-muted-foreground">{readyPct}% hoàn thiện</p>
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              <li>
                Thông tin chung (ảnh, mô tả):{' '}
                {group.description && group.photos.length ? 'Đã đủ' : 'Cần bổ sung'}
              </li>
              <li>
                Ít nhất một {itemLabel}: {group.listingCount ? 'Đã có' : 'Chưa có'}
              </li>
              <li>
                Nội dung {itemLabel} đạt mức sẵn sàng (đủ ảnh, mô tả và giá):{' '}
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
          hint="Tổng lượt đặt của tin đăng"
          icon={<CalendarCheck className="size-4" aria-hidden />}
        />
      </div>
    </div>
  );
}
