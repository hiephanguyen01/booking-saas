import { Link } from 'react-router';
import { CheckCircle2, Circle, Layers3, Pencil, Plus } from 'lucide-react';
import type {
  ListingGroupDetailResponse,
  ListingGroupPendingChangesResponse,
  ListingTypeResponse,
} from '@booking/contracts';
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
import { ListingGroupContentCard } from '~/features/partner/components/listing-groups/listing-group-summary';
import { PageHeader } from '~/components/page-header';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { ListingStatusBadge } from '~/components/status-badge';
import { dashboardPaths } from '~/constants/paths';

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

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request);
  const [groupRes, typesRes, pendingRes] = await Promise.all([
    apiGet<ListingGroupDetailResponse>(`/partner/listing-groups/${params.groupId}`, auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
    apiGet<ListingGroupPendingChangesResponse>(
      `/partner/listing-groups/${params.groupId}/pending-changes`,
      auth,
    ),
  ]);
  if (!groupRes.ok || !groupRes.data)
    throw new Response('Không tìm thấy tin đăng.', { status: groupRes.status });
  const pending = pendingRes.ok ? pendingRes.data : null;
  return {
    group: groupRes.data,
    pendingGroupChange: pending?.group ?? null,
    pendingItemIds: (pending?.listings ?? []).map((revision) => revision.targetId),
    listingType:
      (typesRes.data ?? []).find((type) => type.id === groupRes.data?.listingTypeId) ?? null,
    canWrite: can('partner.listings.write'),
    canPublish: can('partner.listings.publish'),
    canAvailability: can('partner.availability.manage'),
    created: url.searchParams.get('created') === '1',
    updated: url.searchParams.get('updated') === '1',
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, can } = await requirePartner(request);
  return runListingGroupAction({ request, groupId: params.groupId, auth, can });
}

export default function ListingGroupWorkspace({ loaderData, actionData }: Route.ComponentProps) {
  const { group, canWrite, canPublish, canAvailability, pendingGroupChange, pendingItemIds } =
    loaderData;
  const pendingChangeIds = new Set(pendingItemIds);
  const itemLabel = group.itemLabel;
  const adminLocked = isAdminLocked(group);
  // Items of a live post are editable now: the change waits for review instead of
  // taking the whole post offline.
  const canEditItems = canWrite;
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
    pendingChangeIds,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={group.title}
        description={`${loaderData.listingType?.name ?? 'Tin đăng'} · ${group.listingCount} ${itemLabel}`}
        actions={
          <>
            <ListingStatusBadge status={group.status} />
            {canWrite && !adminLocked ? (
              <Button asChild variant="outline" size="sm">
                <Link to={dashboardPaths.partner.listingGroupEdit(group.id)}>
                  <Pencil data-icon="inline-start" /> Sửa thông tin chung
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <SuccessBanner
        message={
          loaderData.created
            ? group.listingCount > 0
              ? `Đã lưu ${itemLabel}. Bạn có thể thêm ${itemLabel} khác hoặc kiểm tra để gửi duyệt.`
              : `Đã lưu bản nháp. Bước tiếp theo là thêm ${itemLabel} đầu tiên.`
            : loaderData.updated
              ? 'Đã lưu thay đổi.'
              : null
        }
      />
      {pendingGroupChange || pendingChangeIds.size > 0 ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <p className="font-medium">Tin đăng có thay đổi đang chờ duyệt</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {pendingGroupChange ? 'Thông tin chung' : null}
            {pendingGroupChange && pendingChangeIds.size > 0 ? ' và ' : null}
            {pendingChangeIds.size > 0 ? `${pendingChangeIds.size} ${itemLabel}` : null} đang chờ
            tenant duyệt. Khách vẫn thấy bản đã duyệt cho tới khi thay đổi được chấp nhận.
          </p>
        </div>
      ) : null}
      <ErrorBanner error={actionData?.error} />
      <GroupStatusAlert group={group} canWrite={canWrite} canPublish={canPublish} />
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          <div className="grid gap-5 px-6 py-5 lg:grid-cols-[15rem_minmax(16rem,1fr)_auto] lg:items-center">
            <div>
              <p className="font-semibold">Trạng thái gửi duyệt</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {group.readyListingCount}/{group.listingCount} {itemLabel} sẵn sàng
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="text-muted-foreground">Mức độ sẵn sàng của các {itemLabel}</span>
                <span className="font-medium tabular-nums">{readyPct}%</span>
              </div>
              <Progress value={readyPct} />
            </div>
            {canWrite && group.status === 'draft' ? (
              <SubmitGroupButton disabled={!commonContentReady || !allListingsReady} />
            ) : null}
          </div>
          <div className="grid border-t sm:grid-cols-3 sm:divide-x">
            <ReadinessItem
              label="Nội dung chung"
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
                <Link to={dashboardPaths.partner.listingGroupItemNew(group.id)}>
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
                    <Link to={dashboardPaths.partner.listingGroupItemNew(group.id)}>
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
    </div>
  );
}
