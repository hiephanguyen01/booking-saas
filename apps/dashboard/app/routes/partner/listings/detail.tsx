import { data, Link } from 'react-router';
import { CalendarDays, FileText, Pencil, Repeat } from 'lucide-react';
import {
  availabilityExceptionInputSchema,
  availabilityExceptionRangeInputSchema,
  pricingRuleInputSchema,
  pricingRuleRangeInputSchema,
  recurringPricingRuleInputSchema,
  PRICING_RULE_PRIORITY,
  type AvailabilityExceptionResponse,
  type AvailabilityRuleResponse,
  type ListingResponse,
  type ListingTypeResponse,
  type Paginated,
  type PartnerCalendarBookingResponse,
  type PricingRuleBulkResult,
  type PricingRuleResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import type { Route } from './+types/detail';
import { apiDelete, apiGet, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EntityRef } from '~/components/entity-ref';
import { WarningCallout } from '~/components/warning-callout';
import { ListingStatusBadge } from '~/components/status-badge';
import { CANCELLATION_SOURCE_LABEL, CancellationTiers } from '~/components/cancellation-tiers';
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
import { EXCEPTION_WINDOW_FIELD } from '~/features/partner/components/listing-calendar/window-list-field';
import { RecurringPricing } from '~/features/partner/components/recurring-pricing';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết tin đăng · Đối tác · BookingOS' }];
}

/** Vietnamese wording for the pricing-rule rejections the API can return. */
const PRICING_ERROR_MESSAGE: Record<string, string> = {
  PRICING_RULE_OVERLAP: 'Khung giờ này trùng với một khung giá đã lưu của cùng ngày.',
  RECURRING_PRICING_RULE_OVERLAP:
    'Đã có một quy tắc lặp lại phủ lên các thứ (và khung giờ) này — sửa hoặc xoá quy tắc cũ trước.',
  PRICING_WINDOW_OUTSIDE_OPEN_HOURS: 'Khung giá phải nằm trong giờ mở cửa của ngày này.',
  PACKAGE_PRICING_FIXED:
    'Tin đăng dùng gói cố định — giá được quản lý trong mục “Các gói dịch vụ”.',
  MODE_NOT_ENABLED: 'Tin đăng chưa bật hình thức đặt này.',
};

function pricingErrorMessage(code: string | undefined, fallback: string | undefined): string {
  return (code ? PRICING_ERROR_MESSAGE[code] : undefined) ?? fallback ?? 'Không lưu được giá.';
}

/**
 * The `custom_hours` windows a dialog posted, as repeated `window=open|close`
 * fields. Malformed rows are dropped so a half-typed time never reaches the API
 * as `""` — zod would reject the whole save with a message about a field the
 * partner cannot see.
 */
function submittedWindows(form: FormData): { openTime: string; closeTime: string }[] {
  return form
    .getAll(EXCEPTION_WINDOW_FIELD)
    .map(String)
    .flatMap((value) => {
      const [openTime, closeTime] = value.split('|');
      return openTime && closeTime ? [{ openTime, closeTime }] : [];
    });
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.listings.read');
  const [res, listingTypesRes] = await Promise.all([
    apiGet<ListingResponse>(`/partner/listings/${params.listingId}`, auth),
    apiGet<ListingTypeResponse[]>('/partner/listing-types', auth),
  ]);
  if (!res.ok || !res.data) {
    throw new Response('Không tìm thấy tin đăng.', { status: res.status === 403 ? 403 : 404 });
  }
  const listing = res.data;
  const listingType =
    (listingTypesRes.ok ? listingTypesRes.data : null)?.find(
      (type) => type.id === listing.listingTypeId,
    ) ?? null;
  const requestedTab = url.searchParams.get('tab');
  const tab: 'detail' | 'calendar' | 'pricing' =
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
          apiGet<PricingRuleResponse[]>(`/partner/listings/${listing.id}/pricing-rules`, auth, {
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
            ? apiGet<PartnerCalendarBookingResponse[]>('/partner/bookings', auth, {
                query: {
                  from: startOfDayUtc(from),
                  to: startOfDayUtc(toDayString(addDays(parseDay(to), 1))),
                },
              })
            : Promise.resolve(null),
          // Availability is stored per resource, so the partner needs to know
          // how many other listings a closure here would also close.
          apiGet<Paginated<ListingResponse>>('/partner/listings', auth, {
            query: { resourceId: listing.resourceId, page: 1, pageSize: 1 },
          }),
        ])
      : [null, null, null, null, null];
  // Recurring rules belong to no month, so this read is deliberately unwindowed.
  const recurringRes =
    tab === 'pricing'
      ? await apiGet<PricingRuleResponse[]>(
          `/partner/listings/${listing.id}/pricing-rules`,
          auth,
        )
      : null;
  // Only bookings that still hold the resource matter: a cancelled one neither
  // blocks the calendar nor deserves a warning.
  const bookings = (bookingsRes?.ok ? (bookingsRes.data ?? []) : []).filter(
    (booking) => booking.resourceId === listing.resourceId && holdsResource(booking),
  );
  return {
    listing,
    listingType,
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
    canAvailability,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, can } = await requirePartner(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const listingRes = await apiGet<ListingResponse>(`/partner/listings/${params.listingId}`, auth);
  if (!listingRes.ok || !listingRes.data)
    return data({ ok: false, error: 'Không tìm thấy tin đăng.' }, { status: 404 });
  const listing = listingRes.data;

  if (intent === 'save_recurring_price' || intent === 'delete_recurring_price') {
    if (!can('partner.listings.write'))
      return data({ ok: false, error: 'Không có quyền sửa giá.' }, { status: 403 });

    if (intent === 'delete_recurring_price') {
      const ruleId = String(form.get('ruleId') ?? '');
      if (!ruleId) return data({ ok: false, error: 'Không tìm thấy quy tắc.' }, { status: 400 });
      const result = await apiDelete(
        `/partner/listings/${listing.id}/pricing-rules/${ruleId}`,
        auth,
      );
      return result.ok
        ? data({ ok: true, error: null })
        : data(
            { ok: false, error: result.error ?? 'Không xoá được quy tắc.' },
            { status: 400 },
          );
    }

    const kind = String(form.get('kind')) === 'time_range' ? 'time_range' : 'day_of_week';
    const parsedForm = recurringPricingRuleInputSchema.safeParse({
      bookingMode: String(form.get('mode')) === 'daily' ? 'daily' : 'hourly',
      kind,
      days: form.getAll('days').map((value) => Number(value)),
      ...(kind === 'time_range'
        ? {
            window: {
              from: String(form.get('windowFrom') ?? ''),
              to: String(form.get('windowTo') ?? ''),
            },
          }
        : {}),
      price: String(form.get('price') ?? '').replace(/\D/g, ''),
      ...(String(form.get('salePrice') ?? '').replace(/\D/g, '')
        ? { salePrice: String(form.get('salePrice')).replace(/\D/g, '') }
        : {}),
    });
    if (!parsedForm.success)
      return data(
        { ok: false, error: parsedForm.error.issues[0]?.message ?? 'Quy tắc không hợp lệ.' },
        { status: 400 },
      );
    const recurring = parsedForm.data;
    const result = await apiPost(
      `/partner/listings/${listing.id}/pricing-rules`,
      {
        bookingMode: recurring.bookingMode,
        ruleType: recurring.kind,
        params:
          recurring.kind === 'time_range'
            ? { from: recurring.window!.from, to: recurring.window!.to, days: recurring.days }
            : { days: recurring.days },
        price: recurring.price,
        ...(recurring.salePrice ? { salePrice: recurring.salePrice } : {}),
        priority: PRICING_RULE_PRIORITY.recurring,
      },
      auth,
    );
    return result.ok
      ? data({ ok: true, error: null })
      : data(
          { ok: false, error: pricingErrorMessage(result.code, result.error) },
          { status: 400 },
        );
  }

  if (intent === 'save_availability_range' || intent === 'save_price_range') {
    const from = String(form.get('from') ?? '');
    const to = String(form.get('to') ?? '');
    if (from < todayString())
      return data({ ok: false, error: 'Dải ngày không được bắt đầu trước hôm nay.' }, { status: 400 });

    if (intent === 'save_availability_range') {
      if (!can('partner.availability.manage'))
        return data({ ok: false, error: 'Không có quyền quản lý lịch.' }, { status: 403 });
      const setting = String(form.get('availabilitySetting') ?? 'closed');
      const parsed = availabilityExceptionRangeInputSchema.safeParse({
        from,
        to,
        type: setting === 'closed' ? 'closed' : 'custom_hours',
        ...(setting === 'custom_hours' ? { windows: submittedWindows(form) } : {}),
      });
      if (!parsed.success)
        return data({ ok: false, error: 'Dải ngày hoặc giờ mở cửa không hợp lệ.' }, { status: 400 });
      const result = await apiPost(
        `/partner/resources/${listing.resourceId}/availability-exceptions/bulk`,
        parsed.data,
        auth,
      );
      if (!result.ok)
        return data(
          { ok: false, error: result.error ?? 'Không lưu được lịch cho dải ngày.' },
          { status: 400 },
        );
      return data({ ok: true, error: null });
    }

    if (!can('partner.listings.write'))
      return data({ ok: false, error: 'Không có quyền sửa giá.' }, { status: 403 });
    const mode = String(form.get('mode')) === 'daily' ? 'daily' : 'hourly';
    const price = String(form.get('price') ?? '').replace(/\D/g, '');
    const salePrice = String(form.get('salePrice') ?? '').replace(/\D/g, '');
    const parsed = pricingRuleRangeInputSchema.safeParse({
      bookingMode: mode,
      dateFrom: from,
      dateTo: to,
      ...(mode === 'hourly'
        ? {
            window: {
              from: String(form.get('windowFrom') ?? ''),
              to: String(form.get('windowTo') ?? ''),
            },
          }
        : {}),
      price,
      ...(salePrice ? { salePrice } : {}),
      priority:
        mode === 'hourly'
          ? PRICING_RULE_PRIORITY.dateTimeRange
          : PRICING_RULE_PRIORITY.dateRange,
    });
    if (!parsed.success)
      return data(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Giá không hợp lệ.' },
        { status: 400 },
      );
    const result = await apiPost<PricingRuleBulkResult>(
      `/partner/listings/${listing.id}/pricing-rules/bulk`,
      parsed.data,
      auth,
    );
    if (!result.ok)
      return data(
        { ok: false, error: pricingErrorMessage(result.code, result.error) },
        { status: 400 },
      );
    return data({
      ok: true,
      error: null,
      summary: {
        created: result.data?.created.length ?? 0,
        skipped: result.data?.skipped ?? [],
      },
    });
  }

  if (intent === 'save_availability' || intent === 'save_price' || intent === 'delete_price') {
    const date = String(form.get('date') ?? '');
    if (date < todayString())
      return data({ ok: false, error: 'Không thể thay đổi ngày đã qua.' }, { status: 400 });

    if (intent === 'save_availability') {
      if (!can('partner.availability.manage'))
        return data({ ok: false, error: 'Không có quyền quản lý lịch.' }, { status: 403 });
      const availabilitySetting = String(form.get('availabilitySetting') ?? 'default');
      const exceptionId = String(form.get('exceptionId') ?? '');
      if (availabilitySetting === 'default') {
        if (exceptionId) {
          const result = await apiDelete(
            `/partner/resources/${listing.resourceId}/availability-exceptions/${exceptionId}`,
            auth,
          );
          if (!result.ok)
            return data(
              { ok: false, error: result.error ?? 'Không đặt lại được lịch tuần.' },
              { status: 400 },
            );
        }
      } else {
        const input = {
          date,
          type: availabilitySetting === 'closed' ? ('closed' as const) : ('custom_hours' as const),
          ...(availabilitySetting === 'custom_hours'
            ? { windows: submittedWindows(form) }
            : {}),
        };
        const parsed = availabilityExceptionInputSchema.safeParse(input);
        if (!parsed.success)
          return data({ ok: false, error: 'Giờ mở cửa không hợp lệ.' }, { status: 400 });
        const result = await apiPost(
          `/partner/resources/${listing.resourceId}/availability-exceptions`,
          parsed.data,
          auth,
        );
        if (!result.ok)
          return data(
            { ok: false, error: result.error ?? 'Không lưu được lịch.' },
            { status: 400 },
          );
      }
    }

    if (intent === 'delete_price') {
      if (!can('partner.listings.write'))
        return data({ ok: false, error: 'Không có quyền sửa giá.' }, { status: 403 });
      const ruleId = String(form.get('ruleId') ?? '');
      if (!ruleId)
        return data({ ok: false, error: 'Không tìm thấy khung giá.' }, { status: 400 });
      const result = await apiDelete(
        `/partner/listings/${listing.id}/pricing-rules/${ruleId}`,
        auth,
      );
      if (!result.ok)
        return data(
          { ok: false, error: result.error ?? 'Không xoá được khung giá.' },
          { status: 400 },
        );
    }

    if (intent === 'save_price') {
      if (!can('partner.listings.write'))
        return data({ ok: false, error: 'Không có quyền sửa giá.' }, { status: 403 });
      const price = String(form.get('price') ?? '').replace(/\D/g, '');
      const salePrice = String(form.get('salePrice') ?? '').replace(/\D/g, '');
      if (!price) {
        if (salePrice)
          return data(
            { ok: false, error: 'Cần nhập giá thường trước khi đặt giá sale.' },
            { status: 400 },
          );
        for (const ruleId of form.getAll('ruleId').map(String).filter(Boolean)) {
          const result = await apiDelete(
            `/partner/listings/${listing.id}/pricing-rules/${ruleId}`,
            auth,
          );
          if (!result.ok)
            return data(
              { ok: false, error: result.error ?? 'Không đặt lại được giá mặc định.' },
              { status: 400 },
            );
        }
      } else {
        const mode = String(form.get('mode')) === 'daily' ? 'daily' : 'hourly';
        const from = String(form.get('from') ?? '');
        const to = String(form.get('to') ?? '');
        const input = {
          bookingMode: mode,
          ruleType: mode === 'hourly' ? 'date_time_range' : 'date_range',
          params:
            mode === 'hourly'
              ? { date, from, to }
              : { from: date, to: date },
          price,
          ...(salePrice ? { salePrice } : {}),
          priority:
            mode === 'hourly'
              ? PRICING_RULE_PRIORITY.dateTimeRange
              : PRICING_RULE_PRIORITY.dateRange,
        };
        const parsed = pricingRuleInputSchema.safeParse(input);
        if (!parsed.success)
          return data(
            {
              ok: false,
              error:
                mode === 'hourly' && from >= to
                  ? 'Giờ kết thúc phải sau giờ bắt đầu.'
                  : (parsed.error.issues[0]?.message ?? 'Giá không hợp lệ.'),
            },
            { status: 400 },
          );
        // Overlap and opening-hours checks live in the API use-case: they must
        // hold for every partner, and reading the hours here would need
        // `partner.availability.manage`, which not every partner has.
        const result = await apiPost(
          `/partner/listings/${listing.id}/pricing-rules`,
          parsed.data,
          auth,
        );
        if (!result.ok)
          return data(
            { ok: false, error: pricingErrorMessage(result.code, result.error) },
            { status: 400 },
          );
      }
    }

    return data({ ok: true, error: null });
  }

  return data({ ok: false, error: 'Thao tác không hợp lệ.' }, { status: 400 });
}

export default function PartnerListingDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, listingType, canWrite, tab } = loaderData;
  const price = listingPriceFrom(listing);
  const source = listing.effectiveCancellationPolicySource;
  const inherited = source !== null && source !== 'listing';
  const adminLocked = listing.status === 'archived' && listing.hiddenBy === 'admin';

  return (
    <div className="space-y-5">
      <div>
        <BackLink to={dashboardPaths.partner.listings} label="Tin đăng" className="mb-2" />
        <PageHeader
          title={listing.title}
          description={`/${listing.slug}`}
          actions={
            canWrite ? (
              <Button asChild size="sm" variant="outline">
                <Link to={dashboardPaths.partner.listing(listing.id) + '/edit'}>
                  <Pencil className="size-4" /> Sửa
                </Link>
              </Button>
            ) : null
          }
        />
      </div>

      <div className="flex w-fit rounded-lg border bg-muted/30 p-1">
        <Button asChild size="sm" variant={tab === 'detail' ? 'secondary' : 'ghost'}>
          <Link to={dashboardPaths.partner.listing(listing.id)}>
            <FileText className="size-4" /> Chi tiết
          </Link>
        </Button>
        <Button asChild size="sm" variant={tab === 'calendar' ? 'secondary' : 'ghost'}>
          <Link to={`${dashboardPaths.partner.listing(listing.id)}?tab=calendar`}>
            <CalendarDays className="size-4" /> Lịch và giá
          </Link>
        </Button>
        <Button asChild size="sm" variant={tab === 'pricing' ? 'secondary' : 'ghost'}>
          <Link to={`${dashboardPaths.partner.listing(listing.id)}?tab=pricing`}>
            <Repeat className="size-4" /> Giá lặp lại
          </Link>
        </Button>
      </div>

      <SuccessBanner message={actionData?.ok ? 'Đã lưu thay đổi.' : null} />
      <ErrorBanner
        error={actionData?.error ?? loaderData.calendarError ?? loaderData.recurringError}
      />

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
        <>
          {adminLocked ? (
            <WarningCallout>Bị quản trị viên ẩn — liên hệ tenant để mở lại.</WarningCallout>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Thông tin</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailGrid columns={3}>
                <DetailField
                  label="Trạng thái"
                  value={<ListingStatusBadge status={listing.status} />}
                />
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
                <DetailField
                  label="Cập nhật"
                  value={<DateTimeValue iso={listing.updatedAt} relative />}
                />
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

          <Card>
            <CardHeader>
              <CardTitle>Chính sách huỷ</CardTitle>
              <CardDescription>
                Chính sách hoàn tiền đang áp dụng cho tin đăng này (ưu tiên: riêng listing → mặc
                định của bạn → mặc định hệ thống).
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
                  Tin đăng này chưa gắn chính sách riêng — đang dùng{' '}
                  {CANCELLATION_SOURCE_LABEL[source]}. Sửa tin đăng để gắn một chính sách riêng.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
