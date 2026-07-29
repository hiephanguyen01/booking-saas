import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CalendarCheck, CheckCircle2, Circle, Layers3, Pencil, Plus, Star } from 'lucide-react';
import type { ListingGroupDetailResponse, ListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Progress } from '@booking/ui/components/ui/progress';
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
import { ErrorBanner } from '~/components/action-feedback';
import { ListingStatusBadge } from '~/components/status-badge';
import { formatNumber } from '~/lib/format';

function ReadinessItem({
  label,
  ready,
  readyLabel,
  pendingLabel,
}: {
  label: string;
  ready: boolean;
  readyLabel: string;
  pendingLabel: string;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      {ready ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{ready ? readyLabel : pendingLabel}</p>
      </div>
    </div>
  );
}

function WorkspaceMetric({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-5 px-6 py-5">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
      <span className="text-muted-foreground">{icon}</span>
    </div>
  );
}

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
  const commonContentReady = Boolean(group.description && group.photos.length);
  const hasListings = group.listingCount > 0;
  const allListingsReady = group.listingCount > 0 && group.readyListingCount === group.listingCount;
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
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="capitalize">{itemLabel} & giá</CardTitle>
            <CardDescription>
              Những lựa chọn khách hàng có thể đặt trong tin đăng này.
            </CardDescription>
          </div>
          {canEditItems && group.listings.length > 0 ? (
            <CardAction>
              <Button asChild size="sm">
                <Link to={`/partner/listing-groups/${group.id}/listings/new`}>
                  <Plus data-icon="inline-start" /> Thêm {itemLabel}
                </Link>
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {group.listings.length === 0 ? (
            <div className="grid gap-4 rounded-lg bg-muted/35 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-5">
              <div className="flex size-11 items-center justify-center rounded-lg bg-background text-muted-foreground shadow-xs">
                <Layers3 className="size-5" aria-hidden />
              </div>
              <div>
                <p className="font-medium">Bắt đầu với {itemLabel} đầu tiên</p>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                  Thêm hình ảnh, sức chứa và giá để khách có thể chọn và đặt {itemLabel} này.
                </p>
              </div>
              {canEditItems ? (
                <div>
                  <Button asChild size="sm" className="w-full sm:w-auto">
                    <Link to={`/partner/listing-groups/${group.id}/listings/new`}>
                      <Plus data-icon="inline-start" /> Thêm {itemLabel}
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
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

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          <div className="grid gap-5 px-6 py-5 lg:grid-cols-[15rem_minmax(16rem,1fr)_auto] lg:items-center">
            <div>
              <p className="font-semibold">Mức độ hoàn thiện</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {group.readyListingCount}/{group.listingCount} {itemLabel} sẵn sàng
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="text-muted-foreground">Tiến độ trước khi gửi duyệt</span>
                <span className="font-medium tabular-nums">{readyPct}%</span>
              </div>
              <Progress value={readyPct} />
            </div>
            {canWrite && group.status === 'draft' ? (
              <SubmitGroupButton disabled={!group.listingCount} />
            ) : null}
          </div>
          <div className="grid border-t sm:grid-cols-3 sm:divide-x">
            <ReadinessItem
              label="Thông tin chung"
              ready={commonContentReady}
              readyLabel="Đã đủ ảnh và mô tả"
              pendingLabel="Cần bổ sung ảnh hoặc mô tả"
            />
            <ReadinessItem
              label={`Danh sách ${itemLabel}`}
              ready={hasListings}
              readyLabel={`Đã có ${group.listingCount} ${itemLabel}`}
              pendingLabel={`Chưa có ${itemLabel} nào`}
            />
            <ReadinessItem
              label={`Nội dung ${itemLabel}`}
              ready={allListingsReady}
              readyLabel="Tất cả đã đủ ảnh, mô tả và giá"
              pendingLabel="Cần bổ sung ảnh, mô tả hoặc giá"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="grid divide-y p-0 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <WorkspaceMetric
            label="Đánh giá trung bình"
            value={group.ratingAvg != null ? group.ratingAvg.toFixed(1) : '—'}
            hint={group.ratingAvg != null ? 'Trên 5 sao' : 'Chưa có đánh giá'}
            icon={<Star className="size-4" aria-hidden />}
          />
          <WorkspaceMetric
            label="Lượt đặt"
            value={formatNumber(group.bookingCount)}
            hint="Tổng lượt đặt của tin đăng"
            icon={<CalendarCheck className="size-4" aria-hidden />}
          />
        </CardContent>
      </Card>
    </div>
  );
}
