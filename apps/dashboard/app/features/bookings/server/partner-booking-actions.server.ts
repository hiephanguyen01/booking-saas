import { data } from 'react-router';
import {
  completeBookingInputSchema,
  markReturnedInputSchema,
  partnerNoteInputSchema,
  reasonInputSchema,
  type PartnerCancelBookingResponse,
  type ReturnBookingResponse,
} from '@booking/contracts';
import type { ApiAuth } from '~/lib/api.server';
import { apiPatch, apiPost } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { actionMessages } from '~/constants/messages';

/**
 * Result of a partner booking action, shared by the list (apiPaths.partner.bookings)
 * and the detail (`/partner/bookings/:id`) routes so both drive the exact same
 * button set + dialogs. `settlement` is populated only by `return`; `refund` only
 * by `cancel`; `intent` echoes which action ran so the UI can target its result.
 */
export interface PartnerBookingActionResult {
  ok: boolean;
  error: string | null;
  intent: string | null;
  settlement: { depositRefund: string; depositShortfall: string; lateFee: string } | null;
  refund: { refundAmount: string; refundPercent: number } | null;
}

const ok = (
  intent: string,
  extra?: Partial<PartnerBookingActionResult>,
): PartnerBookingActionResult => ({
  ok: true,
  error: null,
  intent,
  settlement: null,
  refund: null,
  ...extra,
});

const fail = (error: string, intent: string | null = null): PartnerBookingActionResult => ({
  ok: false,
  error,
  intent,
  settlement: null,
  refund: null,
});

/** Read an optional trimmed string form field, coercing blanks to `undefined`. */
function readOptional(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Dispatch one partner booking action (§8.2/§9.4). Every mutation goes through
 * the partner-audience API (masked customer, no commission); the caller supplies
 * a `can` predicate so the same deny-by-default gating the backend enforces is
 * mirrored in the BFF. Errors are returned as data, never thrown.
 */
export async function runPartnerBookingAction(opts: {
  request: Request;
  auth: ApiAuth;
  can: (permission: string) => boolean;
}) {
  const { auth, can } = opts;
  const form = await opts.request.formData();
  const id = String(form.get('id') ?? '');
  const intent = String(form.get('intent') ?? '');
  if (!id) return data(fail('Thiếu mã lượt đặt.'), { status: 400 });

  const canApprove = can('partner.bookings.approve');
  const canManage = can('partner.bookings.cancel');
  const canWrite = can('partner.bookings.write');

  switch (intent) {
    case 'complete': {
      if (!canWrite)
        return data(fail('Không có quyền hoàn thành dịch vụ.', intent), { status: 403 });
      const parsed = completeBookingInputSchema.safeParse({
        onsiteCollectedAmount: String(form.get('onsiteCollectedAmount') ?? '').trim(),
        note: readOptional(form, 'note'),
      });
      if (!parsed.success) {
        return data(fail('Số tiền thu tại chỗ không hợp lệ (số nguyên VND).', intent), {
          status: 400,
        });
      }
      const res = await apiPost(apiPaths.partner.bookingAction(id, 'complete'), parsed.data, auth);
      return res.ok
        ? data(ok(intent))
        : data(fail(res.error ?? 'Không thể hoàn thành dịch vụ.', intent), { status: 400 });
    }

    case 'approve': {
      if (!canApprove) return data(fail('Không có quyền duyệt lượt đặt.', intent), { status: 403 });
      const res = await apiPost(apiPaths.partner.bookingAction(id, 'approve'), {}, auth);
      return res.ok
        ? data(ok(intent))
        : data(fail(res.error ?? 'Duyệt không thành công.', intent), { status: 400 });
    }

    case 'reject': {
      if (!canApprove)
        return data(fail('Không có quyền từ chối lượt đặt.', intent), { status: 403 });
      const parsed = reasonInputSchema.safeParse({ reason: readOptional(form, 'reason') });
      if (!parsed.success)
        return data(fail('Lý do không hợp lệ (tối đa 500 ký tự).', intent), { status: 400 });
      const body = parsed.data.reason ? { reason: parsed.data.reason } : {};
      const res = await apiPost(apiPaths.partner.bookingAction(id, 'reject'), body, auth);
      return res.ok
        ? data(ok(intent))
        : data(fail(res.error ?? 'Từ chối không thành công.', intent), { status: 400 });
    }

    case 'no-show': {
      if (!canManage)
        return data(fail('Không có quyền đánh dấu vắng mặt.', intent), { status: 403 });
      const parsed = reasonInputSchema.safeParse({ reason: readOptional(form, 'reason') });
      if (!parsed.success)
        return data(fail('Lý do không hợp lệ (tối đa 500 ký tự).', intent), { status: 400 });
      const body = parsed.data.reason ? { reason: parsed.data.reason } : {};
      const res = await apiPost(apiPaths.partner.bookingAction(id, 'no-show'), body, auth);
      return res.ok
        ? data(ok(intent))
        : data(fail(res.error ?? 'Đánh dấu vắng mặt không thành công.', intent), { status: 400 });
    }

    case 'cancel': {
      if (!canManage) return data(fail('Không có quyền huỷ lượt đặt.', intent), { status: 403 });
      const parsed = reasonInputSchema.safeParse({ reason: readOptional(form, 'reason') });
      if (!parsed.success)
        return data(fail('Lý do không hợp lệ (tối đa 500 ký tự).', intent), { status: 400 });
      const body = parsed.data.reason ? { reason: parsed.data.reason } : {};
      const res = await apiPost<PartnerCancelBookingResponse>(
        `/partner/bookings/${id}/cancel`,
        body,
        auth,
      );
      return res.ok && res.data
        ? data(
            ok(intent, {
              refund: {
                refundAmount: res.data.refundAmount,
                refundPercent: res.data.refundPercent,
              },
            }),
          )
        : data(fail(res.error ?? 'Huỷ không thành công.', intent), { status: 400 });
    }

    case 'pick-up': {
      if (!canManage) return data(fail('Không có quyền nhận thiết bị.', intent), { status: 403 });
      const res = await apiPost(apiPaths.partner.bookingAction(id, 'pick-up'), {}, auth);
      return res.ok
        ? data(ok(intent))
        : data(fail(res.error ?? 'Đánh dấu giao thiết bị không thành công.', intent), {
            status: 400,
          });
    }

    case 'return': {
      if (!canManage)
        return data(fail('Không có quyền nhận trả thiết bị.', intent), { status: 403 });
      const damageAmount = String(form.get('damageAmount') ?? '0').trim() || '0';
      const parsed = markReturnedInputSchema.safeParse({
        damageAmount,
        reason: readOptional(form, 'reason'),
      });
      if (!parsed.success)
        return data(fail('Số tiền hư hỏng không hợp lệ (số nguyên VND).', intent), { status: 400 });
      const res = await apiPost<ReturnBookingResponse>(
        `/partner/bookings/${id}/return`,
        parsed.data,
        auth,
      );
      return res.ok && res.data
        ? data(
            ok(intent, {
              settlement: {
                depositRefund: res.data.depositRefund,
                depositShortfall: res.data.depositShortfall,
                lateFee: res.data.lateFee,
              },
            }),
          )
        : data(fail(res.error ?? 'Nhận trả thiết bị không thành công.', intent), { status: 400 });
    }

    case 'set-note': {
      if (!canWrite) return data(fail('Không có quyền ghi chú lượt đặt.', intent), { status: 403 });
      const parsed = partnerNoteInputSchema.safeParse({ note: readOptional(form, 'note') });
      if (!parsed.success)
        return data(fail('Ghi chú không hợp lệ (tối đa 1000 ký tự).', intent), { status: 400 });
      const res = await apiPatch(apiPaths.partner.bookingAction(id, 'note'), parsed.data, auth);
      return res.ok
        ? data(ok(intent))
        : data(fail(res.error ?? 'Lưu ghi chú không thành công.', intent), { status: 400 });
    }

    default:
      return data(fail(actionMessages.invalidIntent), { status: 400 });
  }
}
