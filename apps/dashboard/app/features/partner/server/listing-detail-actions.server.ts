import { data } from 'react-router';
import {
  availabilityExceptionInputSchema,
  availabilityExceptionRangeInputSchema,
  pricingRuleInputSchema,
  pricingRuleRangeInputSchema,
  recurringPricingRuleInputSchema,
  submitListingResponseSchema,
  PRICING_RULE_PRIORITY,
  type ListingResponse,
  type PricingRuleBulkResult,
  type SubmitListingResponse,
} from '@booking/contracts';
import { apiDelete, apiGet, apiPost } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { requirePartner } from '~/features/partner/server/partner.server';
import { EXCEPTION_WINDOW_FIELD } from '~/features/partner/components/listing-calendar/window-list-field';
import { todayString } from '~/lib/calendar-dates';
import { actionMessages, notFoundMessages } from '~/constants/messages';

/**
 * The write path behind the partner listing detail screen: every `intent` its
 * tabs post — discard-revision, submit, publish/hide, opening hours, calendar
 * exceptions and pricing rules. It used to sit inline in the route module,
 * where 322 of its 705 lines separated the loader from the UI it feeds.
 */

/** The subset of `Route.ActionArgs` this needs; route types stay in the route. */
export interface ListingDetailActionArgs {
  request: Request;
  params: { listingId: string };
}

/** Vietnamese wording for the pricing-rule rejections the API can return. */
const PRICING_ERROR_MESSAGE: Record<string, string> = {
  PRICING_RULE_OVERLAP: 'Khung giờ này trùng với một khung giá đã lưu của cùng ngày.',
  PRICING_RULE_SCOPE_TAKEN:
    'Một thay đổi khác cho đúng phạm vi này vừa được lưu trước — tải lại trang rồi thử lại.',
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

export async function runListingDetailAction({ request, params }: ListingDetailActionArgs) {
  const { auth, can } = await requirePartner(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const listingRes = await apiGet<ListingResponse>(apiPaths.partner.listing(params.listingId), auth);
  if (!listingRes.ok || !listingRes.data)
    return data({ ok: false, error: notFoundMessages.listing }, { status: 404 });
  const listing = listingRes.data;

  if (intent === 'discard-revision') {
    if (!can('partner.listings.write')) {
      return data({ ok: false, error: 'Không có quyền hủy thay đổi.' }, { status: 403 });
    }
    const result = await apiDelete(apiPaths.partner.listingRevision(listing.id), auth);
    return result.ok
      ? data({ ok: true, error: null })
      : data(
          { ok: false, error: result.error ?? 'Hủy thay đổi không thành công.' },
          { status: 400 },
        );
  }

  if (intent === 'submit') {
    if (!can('partner.listings.write')) {
      return data({ ok: false, error: 'Không có quyền gửi duyệt.' }, { status: 403 });
    }
    const result = await apiPost<SubmitListingResponse>(
      `/partner/listings/${listing.id}/submit`,
      {},
      auth,
      { schema: submitListingResponseSchema },
    );
    return result.ok
      ? data({ ok: true, error: null })
      : data({ ok: false, error: result.error ?? 'Gửi duyệt không thành công.' }, { status: 400 });
  }

  if (intent === 'hide' || intent === 'republish') {
    if (!can('partner.listings.publish')) {
      return data({ ok: false, error: 'Không có quyền thay đổi hiển thị.' }, { status: 403 });
    }
    const result = await apiPost(`/partner/listings/${listing.id}/${intent}`, {}, auth);
    return result.ok
      ? data({ ok: true, error: null })
      : data({ ok: false, error: result.error ?? actionMessages.actionFailed }, { status: 400 });
  }

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
        : data({ ok: false, error: result.error ?? 'Không xoá được quy tắc.' }, { status: 400 });
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
      apiPaths.partner.listingPricingRules(listing.id),
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
      : data({ ok: false, error: pricingErrorMessage(result.code, result.error) }, { status: 400 });
  }

  if (intent === 'save_availability_range' || intent === 'save_price_range') {
    const from = String(form.get('from') ?? '');
    const to = String(form.get('to') ?? '');
    if (from < todayString())
      return data(
        { ok: false, error: 'Dải ngày không được bắt đầu trước hôm nay.' },
        { status: 400 },
      );

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
        return data(
          { ok: false, error: 'Dải ngày hoặc giờ mở cửa không hợp lệ.' },
          { status: 400 },
        );
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
        mode === 'hourly' ? PRICING_RULE_PRIORITY.dateTimeRange : PRICING_RULE_PRIORITY.dateRange,
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
          ...(availabilitySetting === 'custom_hours' ? { windows: submittedWindows(form) } : {}),
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
      if (!ruleId) return data({ ok: false, error: 'Không tìm thấy khung giá.' }, { status: 400 });
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
          params: mode === 'hourly' ? { date, from, to } : { from: date, to: date },
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
          apiPaths.partner.listingPricingRules(listing.id),
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

  return data({ ok: false, error: actionMessages.invalidIntent }, { status: 400 });
}
