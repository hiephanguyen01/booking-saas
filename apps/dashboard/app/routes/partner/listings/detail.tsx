import { Link } from 'react-router';
import { Pencil } from 'lucide-react';
import {
  type AvailabilityExceptionResponse,
  type AvailabilityRuleResponse,
  type ListingResponse,
  type ListingRevisionResponse,
  type ListingTypeResponse,
  type Paginated,
  type PartnerCalendarBookingResponse,
  type PricingRuleResponse,
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
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import type { Route } from './+types/detail';
import { apiGet } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EntityRef } from '~/components/entity-ref';
import { ListingStatusBadge } from '~/components/status-badge';
import { CancellationTiers } from '~/components/cancellation-tiers';
import { CANCELLATION_SOURCE_LABEL } from '~/constants/finance';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { dashboardPaths } from '~/constants/paths';
import { listingPriceFrom } from '~/lib/listing-price';
import {
  addDays,
  monthBounds,
  parseDay,
  startOfDayUtc,
  toDayString,
  todayString,
} from '~/lib/calendar-dates';
import { holdsResource } from '~/features/partner/lib/listing-calendar';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { ListingCalendarPricing } from '~/features/partner/components/listing-calendar';
import { RecurringPricing } from '~/features/partner/components/recurring-pricing';
import { ListingLifecycleCard } from '~/features/partner/components/listings/listing-lifecycle-card';
import { listingSubmissionReadiness } from '~/features/partner/lib/listing-readiness';
import { PendingChangeBanner } from '~/features/partner/components/pending-change-banner';
import {
  ListingWorkspaceNav,
  type ListingWorkspaceTab,
} from '~/features/partner/components/listings/listing-workspace-nav';
import { PhotoAndDescriptionSections } from '~/components/media-detail-sections';
import { apiPaths } from '~/constants/api-paths';
import { runListingDetailAction } from '~/features/partner/server/listing-detail-actions.server';
import { notFoundMessages } from '~/constants/messages';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết tin đăng · Đối tác · BookingOS' }];
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.listings.read');
  const [res, listingTypesRes, revisionRes] = await Promise.all([
    apiGet<ListingResponse>(apiPaths.partner.listing(params.listingId), auth),
    apiGet<ListingTypeResponse[]>(apiPaths.partner.listingTypes, auth),
    apiGet<ListingRevisionResponse | null>(apiPaths.partner.listingRevision(params.listingId), auth),
  ]);
  if (!res.ok || !res.data) {
    throw new Response(notFoundMessages.listing, { status: res.status === 403 ? 403 : 404 });
  }
  const listing = res.data;
  const listingType =
    (listingTypesRes.ok ? listingTypesRes.data : null)?.find(
      (type) => type.id === listing.listingTypeId,
    ) ?? null;
  const requestedTab = url.searchParams.get('tab');
  const tab: ListingWorkspaceTab =
    requestedTab === 'calendar' || requestedTab === 'pricing' ? requestedTab : 'detail';
  const requestedMonth = url.searchParams.get('month');
  const month =
    requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth)
      ? requestedMonth
      : todayString().slice(0, 7);
  const mode: 'hourly' | 'daily' =
    url.searchParams.get('mode') === 'daily' && listing.bookingModes.includes('daily')
      ? 'daily'
      : listing.bookingModes.includes('hourly')
        ? 'hourly'
        : 'daily';
  const canAvailability = can('partner.availability.manage');
  // Both calendar reads are windowed to the month on screen: their defaults
  // start at today, so an unwindowed read of a past or far-future month comes
  // back empty and every stored closure/price would render as "no override".
  const { from, to } = monthBounds(month);
  const calendarRange = { from, to };
  const [pricingRes, exceptionsRes, weeklyRes, bookingsRes, siblingsRes] =
    tab === 'calendar'
      ? await Promise.all([
          apiGet<PricingRuleResponse[]>(apiPaths.partner.listingPricingRules(listing.id), auth, {
            query: calendarRange,
          }),
          canAvailability
            ? apiGet<AvailabilityExceptionResponse[]>(
                `/partner/resources/${listing.resourceId}/availability-exceptions`,
                auth,
                { query: calendarRange },
              )
            : Promise.resolve(null),
          canAvailability
            ? apiGet<AvailabilityRuleResponse[]>(
                `/partner/listings/${listing.id}/availability-rules`,
                auth,
              )
            : Promise.resolve(null),
          // The booking feed is timeslot-windowed on instants, and its `to` is
          // exclusive — hence the day after the month's last date.
          can('partner.bookings.read')
            ? apiGet<PartnerCalendarBookingResponse[]>(apiPaths.partner.bookings, auth, {
                query: {
                  from: startOfDayUtc(from),
                  to: startOfDayUtc(toDayString(addDays(parseDay(to), 1))),
                },
              })
            : Promise.resolve(null),
          // Availability is stored per resource, so the partner needs to know
          // how many other listings a closure here would also close.
          apiGet<Paginated<ListingResponse>>(apiPaths.partner.listings, auth, {
            query: { resourceId: listing.resourceId, page: 1, pageSize: 1 },
          }),
        ])
      : [null, null, null, null, null];
  // Recurring rules belong to no month, so this read is deliberately unwindowed.
  const recurringRes =
    tab === 'pricing'
      ? await apiGet<PricingRuleResponse[]>(apiPaths.partner.listingPricingRules(listing.id), auth)
      : null;
  // Only bookings that still hold the resource matter: a cancelled one neither
  // blocks the calendar nor deserves a warning.
  const bookings = (bookingsRes?.ok ? (bookingsRes.data ?? []) : []).filter(
    (booking) => booking.resourceId === listing.resourceId && holdsResource(booking),
  );
  return {
    listing,
    listingType,
    revision: revisionRes.ok ? (revisionRes.data ?? null) : null,
    tab,
    month,
    mode,
    pricingRules: pricingRes?.ok ? (pricingRes.data ?? []) : [],
    exceptions: exceptionsRes?.ok ? (exceptionsRes.data ?? []) : [],
    weeklyRules: weeklyRes?.ok ? (weeklyRes.data ?? []) : [],
    bookings,
    recurringRules: (recurringRes?.ok ? (recurringRes.data ?? []) : []).filter(
      (rule) => rule.ruleType === 'day_of_week' || rule.ruleType === 'time_range',
    ),
    recurringError:
      recurringRes && !recurringRes.ok
        ? (recurringRes.error ?? 'Không tải được quy tắc giá lặp lại.')
        : null,
    siblingCount: Math.max(0, (siblingsRes?.ok ? (siblingsRes.data?.total ?? 1) : 1) - 1),
    calendarError:
      pricingRes && !pricingRes.ok ? (pricingRes.error ?? 'Không tải được lịch giá.') : null,
    canWrite: can('partner.listings.write'),
    canPublish: can('partner.listings.publish'),
    canAvailability,
    created: url.searchParams.get('created') === '1',
    updated: url.searchParams.get('updated') === '1',
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  return runListingDetailAction({ request, params });
}

export default function PartnerListingDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, listingType, canWrite, tab } = loaderData;
  const price = listingPriceFrom(listing);
  const source = listing.effectiveCancellationPolicySource;
  const inherited = source !== null && source !== 'listing';
  const readiness = listingSubmissionReadiness(listing);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <BackLink to={dashboardPaths.partner.listings} label="Tin đăng" className="mb-2" />
          <PageHeader
            title={listing.title}
            description={`/${listing.slug}`}
            titleAdornment={<ListingStatusBadge status={listing.status} />}
            actions={
              canWrite ? (
                <Button asChild variant="outline">
                  <Link to={dashboardPaths.partner.listingEdit(listing.id)}>
                    <Pencil className="size-4" /> Sửa
                  </Link>
                </Button>
              ) : null
            }
          />
        </div>

        <ListingWorkspaceNav listingId={listing.id} activeTab={tab} />
      </div>

      <div className="space-y-4">
        <SuccessBanner
          message={
            actionData?.ok
              ? 'Đã cập nhật.'
              : loaderData.created
                ? 'Đã lưu bản nháp. Kiểm tra các mục còn thiếu trước khi gửi duyệt.'
                : loaderData.updated
                  ? 'Đã lưu thay đổi.'
                  : null
          }
        />
        <ErrorBanner
          error={actionData?.error ?? loaderData.calendarError ?? loaderData.recurringError}
        />
        <PendingChangeBanner revision={loaderData.revision} />
        <ListingLifecycleCard
          listing={listing}
          checklist={readiness.checklist}
          ready={readiness.ready}
          canWrite={loaderData.canWrite}
          canPublish={loaderData.canPublish}
        />
      </div>

      {tab === 'pricing' ? (
        <RecurringPricing
          listing={listing}
          mode={loaderData.mode}
          rules={loaderData.recurringRules}
          canWrite={loaderData.canWrite}
        />
      ) : tab === 'calendar' ? (
        <ListingCalendarPricing
          listing={listing}
          month={loaderData.month}
          mode={loaderData.mode}
          rules={loaderData.pricingRules}
          exceptions={loaderData.exceptions}
          weeklyRules={loaderData.weeklyRules}
          bookings={loaderData.bookings}
          siblingCount={loaderData.siblingCount}
          canWrite={loaderData.canWrite}
          canAvailability={loaderData.canAvailability}
        />
      ) : (
        <div className="space-y-4">
          <Card className="rounded-2xl shadow-none">
            <CardHeader>
              <CardTitle>Nội dung bài đăng</CardTitle>
              <CardDescription>Hình ảnh và mô tả khách hàng nhìn thấy khi xem tin.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <PhotoAndDescriptionSections
                photos={listing.photos}
                alt={listing.title}
                description={listing.description ?? null}
                photoEmptyMessage="Chưa có hình ảnh cho tin đăng này."
              />
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-none">
            <CardHeader className="border-b">
              <CardTitle>Thông tin</CardTitle>
              <CardAction className="text-right text-xs text-muted-foreground">
                <span className="mr-1">Cập nhật</span>
                <DateTimeValue iso={listing.updatedAt} relative />
              </CardAction>
            </CardHeader>
            <CardContent>
              <DetailGrid columns={1} className="sm:grid-cols-2 xl:grid-cols-4">
                <DetailField label="Loại dịch vụ" value={listingType?.name ?? '—'} />
                <DetailField
                  label="Hình thức"
                  value={listing.bookingModes.map((m) => BOOKING_MODE_LABEL[m] ?? m).join(', ')}
                />
                <DetailField
                  label="Giá từ"
                  value={price ? <Money value={price} /> : 'Chưa có giá'}
                />
                <DetailField label="Đặt cọc" value={`${listing.depositPercent}%`} />
                {listing.groupId ? (
                  <DetailField
                    label="Thuộc tin đăng"
                    value={
                      <EntityRef
                        to={dashboardPaths.partner.listingGroup(listing.groupId)}
                        name="Xem tin đăng"
                      />
                    }
                  />
                ) : null}
              </DetailGrid>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-none">
            <CardHeader>
              <CardTitle>Chính sách huỷ</CardTitle>
              <CardDescription>
                Chính sách hoàn tiền được ưu tiên theo thứ tự: chính sách riêng của tin đăng, chính
                sách mặc định của đối tác, sau đó là chính sách mặc định của hệ thống.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <DetailSection
                title="Đang áp dụng"
                emptyMessage="Chưa có chính sách huỷ nào áp dụng."
              >
                {listing.effectiveCancellationPolicy ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      {listing.effectiveCancellationPolicy.name}
                      {source ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({CANCELLATION_SOURCE_LABEL[source]})
                        </span>
                      ) : null}
                    </p>
                    <CancellationTiers rules={listing.effectiveCancellationPolicy.rules} />
                  </div>
                ) : null}
              </DetailSection>
              {inherited ? (
                <p className="text-xs text-muted-foreground">
                  Tin đăng này chưa gắn chính sách riêng. Hiện đang dùng{' '}
                  {CANCELLATION_SOURCE_LABEL[source]}. Sửa tin đăng để gắn một chính sách riêng.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
