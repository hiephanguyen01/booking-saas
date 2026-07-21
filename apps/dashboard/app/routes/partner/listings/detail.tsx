import { data, Link } from 'react-router';
import { CalendarDays, FileText, Pencil } from 'lucide-react';
import {
  availabilityExceptionInputSchema,
  pricingRuleInputSchema,
  type AvailabilityExceptionResponse,
  type AvailabilityRuleResponse,
  type ListingResponse,
  type ListingTypeResponse,
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
import { ListingStatusBadge } from '~/components/status-badge';
import { CANCELLATION_SOURCE_LABEL, CancellationTiers } from '~/components/cancellation-tiers';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { dashboardPaths } from '~/constants/paths';
import { listingPriceFrom } from '~/lib/listing-price';
import { todayString } from '~/lib/calendar-dates';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { ListingCalendarPricing } from '~/features/partner/components/listing-calendar-pricing';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết tin đăng · Đối tác · Bookify' }];
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
  const tab = url.searchParams.get('tab') === 'calendar' ? 'calendar' : 'detail';
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
  const [pricingRes, exceptionsRes, weeklyRes] =
    tab === 'calendar'
      ? await Promise.all([
          apiGet<PricingRuleResponse[]>(`/partner/listings/${listing.id}/pricing-rules`, auth),
          canAvailability
            ? apiGet<AvailabilityExceptionResponse[]>(
                `/partner/resources/${listing.resourceId}/availability-exceptions`,
                auth,
              )
            : Promise.resolve(null),
          canAvailability
            ? apiGet<AvailabilityRuleResponse[]>(
                `/partner/listings/${listing.id}/availability-rules`,
                auth,
              )
            : Promise.resolve(null),
        ])
      : [null, null, null];
  return {
    listing,
    listingType,
    tab,
    month,
    mode,
    pricingRules: pricingRes?.ok ? (pricingRes.data ?? []) : [],
    exceptions: exceptionsRes?.ok ? (exceptionsRes.data ?? []) : [],
    weeklyRules: weeklyRes?.ok ? (weeklyRes.data ?? []) : [],
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
            ? {
                openTime: String(form.get('openTime') ?? ''),
                closeTime: String(form.get('closeTime') ?? ''),
              }
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
          priority: 1_000,
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
        if (mode === 'hourly') {
          const pricingRes = await apiGet<PricingRuleResponse[]>(
            `/partner/listings/${listing.id}/pricing-rules`,
            auth,
          );
          if (!pricingRes.ok)
            return data(
              { ok: false, error: 'Không kiểm tra được các khung giá hiện tại.' },
              { status: 400 },
            );
          const overlap = (pricingRes.data ?? []).find(
            (rule) =>
              rule.bookingMode === 'hourly' &&
              rule.ruleType === 'date_time_range' &&
              String(rule.params.date) === date &&
              !(String(rule.params.from) === from && String(rule.params.to) === to) &&
              from < String(rule.params.to) &&
              to > String(rule.params.from),
          );
          if (overlap)
            return data(
              {
                ok: false,
                error: `Khung ${from}–${to} bị trùng với ${String(overlap.params.from)}–${String(overlap.params.to)}.`,
              },
              { status: 400 },
            );

          if (can('partner.availability.manage')) {
            const [exceptionsRes, weeklyRes] = await Promise.all([
              apiGet<AvailabilityExceptionResponse[]>(
                `/partner/resources/${listing.resourceId}/availability-exceptions`,
                auth,
              ),
              apiGet<AvailabilityRuleResponse[]>(
                `/partner/listings/${listing.id}/availability-rules`,
                auth,
              ),
            ]);
            if (!exceptionsRes.ok || !weeklyRes.ok)
              return data(
                { ok: false, error: 'Không kiểm tra được giờ mở cửa của ngày này.' },
                { status: 400 },
              );
            const exception = (exceptionsRes.data ?? []).find((item) => item.date === date);
            const openWindows =
              exception?.type === 'closed'
                ? []
                : exception?.type === 'custom_hours' &&
                    exception.openTime &&
                    exception.closeTime
                  ? [{ from: exception.openTime, to: exception.closeTime }]
                  : (weeklyRes.data ?? [])
                      .filter(
                        (rule) =>
                          rule.dayOfWeek === new Date(`${date}T12:00:00Z`).getUTCDay(),
                      )
                      .map((rule) => ({ from: rule.openTime, to: rule.closeTime }));
            if (!openWindows.some((window) => from >= window.from && to <= window.to))
              return data(
                {
                  ok: false,
                  error:
                    openWindows.length === 0
                      ? 'Ngày này đang đóng cửa nên không thể thêm khung giá.'
                      : `Khung giá phải nằm trong giờ mở cửa: ${openWindows.map((window) => `${window.from}–${window.to}`).join(', ')}.`,
                },
                { status: 400 },
              );
          }
        }
        const result = await apiPost(
          `/partner/listings/${listing.id}/pricing-rules`,
          parsed.data,
          auth,
        );
        if (!result.ok)
          return data(
            { ok: false, error: result.error ?? 'Không lưu được giá.' },
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
      </div>

      <SuccessBanner message={actionData?.ok ? 'Đã lưu thay đổi.' : null} />
      <ErrorBanner error={actionData?.error ?? loaderData.calendarError} />

      {tab === 'calendar' ? (
        <ListingCalendarPricing
          listing={listing}
          month={loaderData.month}
          mode={loaderData.mode}
          rules={loaderData.pricingRules}
          exceptions={loaderData.exceptions}
          weeklyRules={loaderData.weeklyRules}
          canWrite={loaderData.canWrite}
          canAvailability={loaderData.canAvailability}
        />
      ) : (
        <>
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
