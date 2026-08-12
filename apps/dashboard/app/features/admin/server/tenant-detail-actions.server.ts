import { data, redirect } from 'react-router';
import {
  addDomainInputSchema,
  assignSubscriptionInputSchema,
  domainDnsCheckResponseSchema,
  updatePlatformRateInputSchema,
  updateTenantInputSchema,
  type DomainDnsCheckResponse,
  type DomainResponse,
  type DomainVerificationResult,
  type SubscriptionResponse,
  type TenantDetailResponse,
} from '@booking/contracts';
import { apiDelete, apiPatch, apiPost } from '~/lib/api.server';
import { dashboardPaths } from '~/constants/paths';
import { requirePlatform } from './admin.server';
import { vietnamCalendarDayEndIso } from './subscription-dates.server';
import { apiPaths } from '~/constants/api-paths';
import { actionMessages } from '~/constants/messages';

/** Which form/card an action result belongs to, so an error stays in its own card. */
export type ActionScope = 'tenant' | 'domain' | 'subscription' | 'status' | 'platform-rate';

export interface ActionResult {
  scope: ActionScope;
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Partial<Record<string, string[] | undefined>>;
  /** Set by `dns-check-domain` only, so the verdict renders in the row it came from. */
  domainId?: string;
  dnsCheck?: DomainDnsCheckResponse;
}

/**
 * JSON branch of the tenant-detail action: the tenant-edit and add-domain
 * GenericForms both submit JSON to the route.
 */
export async function handleTenantDetailJsonAction(request: Request, id: string) {
  const body: unknown = await request.json();
  const { auth } = await requirePlatform(request, 'platform.tenants.write');

  // Discriminate on `hostname`, which exists only in the add-domain payload.
  if (body && typeof body === 'object' && 'hostname' in body) {
    const parsed = addDomainInputSchema.safeParse(body);
    if (!parsed.success) {
      return data<ActionResult>(
        { scope: 'domain', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const res = await apiPost<DomainResponse>(apiPaths.admin.tenantDomains(id), parsed.data, auth);
    if (!res.ok) {
      // The backend's DomainError message is English; map the two prefix rules
      // to Vietnamese so they read naturally here too — same mapping as the
      // tenant screen's own add-domain form (settings-actions.server.ts). Any
      // other code falls back to the raw message.
      const message =
        res.code === 'ADMIN_DOMAIN_PREFIX_REQUIRED'
          ? 'Tên miền trang quản trị phải bắt đầu bằng "admin.".'
          : res.code === 'ADMIN_PREFIX_RESERVED'
            ? 'Tiền tố "admin." được dành riêng cho tên miền trang quản trị.'
            : res.error;
      return data<ActionResult>(
        { scope: 'domain', error: message, fieldErrors: res.errors },
        { status: 400 },
      );
    }
    return data<ActionResult>({ scope: 'domain', ok: true, message: 'Đã thêm tên miền.' });
  }

  const parsed = updateTenantInputSchema.safeParse(body);
  if (!parsed.success) {
    return data<ActionResult>(
      { scope: 'tenant', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const res = await apiPatch<TenantDetailResponse>(apiPaths.admin.tenant(id), parsed.data, auth);
  if (!res.ok) {
    return data<ActionResult>(
      { scope: 'tenant', error: res.error, fieldErrors: res.errors },
      { status: 400 },
    );
  }
  return data<ActionResult>({ scope: 'tenant', ok: true, message: 'Đã cập nhật tenant.' });
}

/**
 * FormData branch of the tenant-detail action: the quick actions
 * (verify/remove domain, set status, assign subscription) submit urlencoded
 * FormData with an `intent` field.
 */
export async function handleTenantDetailFormAction(request: Request, id: string) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const permission =
    intent === 'assign-subscription'
      ? 'platform.subscriptions.manage'
      : intent === 'set-platform-rate'
        ? 'platform.finance.manage'
        : 'platform.tenants.write';
  const { auth } = await requirePlatform(request, permission);

  if (intent === 'set-platform-rate') {
    const parsed = updatePlatformRateInputSchema.safeParse({
      platformRate: Number(form.get('platformRate')),
    });
    if (!parsed.success) {
      return data<ActionResult>(
        { scope: 'platform-rate', error: 'Phí nền tảng phải là số nguyên từ 0 đến 100.' },
        { status: 400 },
      );
    }
    const res = await apiPatch(apiPaths.platform.tenantPlatformRate(id), parsed.data, auth);
    if (!res.ok) {
      // The domain message is English; the dashboard is Vietnamese-hardcoded, and
      // this is the one rejection an admin will actually hit.
      const message =
        res.code === 'COMMISSION_RATES_NEGATIVE_TENANT'
          ? 'Phí nền tảng quá cao: phí nền tảng + hoa hồng cộng tác viên không được vượt mức hoa hồng tenant thu của partner. Không có quy tắc nào bị thay đổi.'
          : res.error;
      return data<ActionResult>({ scope: 'platform-rate', error: message }, { status: 400 });
    }
    return data<ActionResult>({
      scope: 'platform-rate',
      ok: true,
      message: 'Đã cập nhật phí nền tảng.',
    });
  }

  if (intent === 'verify-domain') {
    const domainId = String(form.get('domainId') ?? '');
    const res = await apiPost<DomainVerificationResult>(
      apiPaths.admin.tenantDomainVerify(id, domainId),
      {},
      auth,
    );
    if (!res.ok) return data<ActionResult>({ scope: 'domain', error: res.error }, { status: 400 });
    const message =
      res.data?.status === 'verified'
        ? 'Tên miền đã được xác minh.'
        : 'Đang kiểm tra bản ghi DNS, vui lòng thử lại sau ít phút.';
    return data<ActionResult>({ scope: 'domain', ok: true, message });
  }

  if (intent === 'dns-check-domain') {
    const domainId = String(form.get('domainId') ?? '');
    const res = await apiPost<DomainDnsCheckResponse>(
      apiPaths.admin.tenantDomainDnsCheck(id, domainId),
      {},
      auth,
      { schema: domainDnsCheckResponseSchema },
    );
    if (!res.ok || !res.data) {
      return data<ActionResult>(
        { scope: 'domain', error: res.error ?? 'Không kiểm tra được kết nối tên miền.' },
        { status: 400 },
      );
    }
    return data<ActionResult>({ scope: 'domain', ok: true, domainId, dnsCheck: res.data });
  }

  if (intent === 'remove-domain') {
    const domainId = String(form.get('domainId') ?? '');
    const res = await apiDelete(apiPaths.admin.tenantDomain(id, domainId), auth);
    if (!res.ok) {
      const message =
        res.code === 'DOMAIN_PRIMARY_REQUIRED'
          ? 'Không thể xoá tên miền chính. Đặt một tên miền khác làm chính trước.'
          : (res.error ?? 'Không xoá được tên miền.');
      return data<ActionResult>({ scope: 'domain', error: message }, { status: 400 });
    }
    return data<ActionResult>({ scope: 'domain', ok: true, message: 'Đã xoá tên miền.' });
  }

  if (intent === 'set-status') {
    const status = String(form.get('status') ?? '');
    const res = await apiPatch<TenantDetailResponse>(apiPaths.admin.tenant(id), { status }, auth);
    if (!res.ok) return data<ActionResult>({ scope: 'status', error: res.error }, { status: 400 });
    return data<ActionResult>({ scope: 'status', ok: true, message: 'Đã cập nhật trạng thái.' });
  }

  if (intent === 'assign-subscription') {
    const expiresAtRaw = String(form.get('expiresAt') ?? '');
    const payload = {
      planId: String(form.get('planId') ?? ''),
      // The date input is a Vietnam calendar day; preserve that boundary in UTC.
      expiresAt: vietnamCalendarDayEndIso(expiresAtRaw) ?? '',
      status: String(form.get('status') ?? 'active'),
      note: (form.get('note') as string) || undefined,
    };
    const parsed = assignSubscriptionInputSchema.safeParse(payload);
    if (!parsed.success) {
      return data<ActionResult>(
        {
          scope: 'subscription',
          error: 'Dữ liệu gói không hợp lệ.',
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const res = await apiPost<SubscriptionResponse>(
      apiPaths.admin.tenantSubscription(id),
      parsed.data,
      auth,
    );
    if (!res.ok)
      return data<ActionResult>({ scope: 'subscription', error: res.error }, { status: 400 });
    return redirect(dashboardPaths.admin.tenant(id));
  }

  return data<ActionResult>({ scope: 'tenant', error: actionMessages.invalidIntent }, { status: 400 });
}
