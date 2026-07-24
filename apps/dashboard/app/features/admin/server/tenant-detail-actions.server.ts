import { data, redirect } from 'react-router';
import {
  addDomainInputSchema,
  assignSubscriptionInputSchema,
  updateTenantInputSchema,
  type DomainResponse,
  type DomainVerificationResult,
  type SubscriptionResponse,
  type TenantDetailResponse,
} from '@booking/contracts';
import { apiDelete, apiPatch, apiPost } from '~/lib/api.server';
import { dashboardPaths } from '~/constants/paths';
import { requirePlatform } from './admin.server';

/** Which form/card an action result belongs to, so an error stays in its own card. */
export type ActionScope = 'tenant' | 'domain' | 'subscription' | 'status';

export interface ActionResult {
  scope: ActionScope;
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Partial<Record<string, string[] | undefined>>;
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
    const res = await apiPost<DomainResponse>(`/admin/tenants/${id}/domains`, parsed.data, auth);
    if (!res.ok) {
      return data<ActionResult>(
        { scope: 'domain', error: res.error, fieldErrors: res.errors },
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
  const res = await apiPatch<TenantDetailResponse>(`/admin/tenants/${id}`, parsed.data, auth);
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
    intent === 'assign-subscription' ? 'platform.subscriptions.manage' : 'platform.tenants.write';
  const { auth } = await requirePlatform(request, permission);

  if (intent === 'verify-domain') {
    const domainId = String(form.get('domainId') ?? '');
    const res = await apiPost<DomainVerificationResult>(
      `/admin/tenants/${id}/domains/${domainId}/verify`,
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

  if (intent === 'remove-domain') {
    const domainId = String(form.get('domainId') ?? '');
    const res = await apiDelete(`/admin/tenants/${id}/domains/${domainId}`, auth);
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
    const res = await apiPatch<TenantDetailResponse>(`/admin/tenants/${id}`, { status }, auth);
    if (!res.ok) return data<ActionResult>({ scope: 'status', error: res.error }, { status: 400 });
    return data<ActionResult>({ scope: 'status', ok: true, message: 'Đã cập nhật trạng thái.' });
  }

  if (intent === 'assign-subscription') {
    const expiresAtRaw = String(form.get('expiresAt') ?? '');
    const payload = {
      planId: String(form.get('planId') ?? ''),
      // A calendar day → end-of-day UTC so it is strictly after `startsAt` (now).
      expiresAt: expiresAtRaw ? new Date(`${expiresAtRaw}T23:59:59.000Z`).toISOString() : '',
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
      `/admin/tenants/${id}/subscription`,
      parsed.data,
      auth,
    );
    if (!res.ok)
      return data<ActionResult>({ scope: 'subscription', error: res.error }, { status: 400 });
    return redirect(dashboardPaths.admin.tenant(id));
  }

  return data<ActionResult>({ scope: 'tenant', error: 'Hành động không hợp lệ.' }, { status: 400 });
}
