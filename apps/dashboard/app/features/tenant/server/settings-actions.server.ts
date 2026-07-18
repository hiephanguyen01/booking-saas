import { data as routeData } from 'react-router';
import {
  addDomainInputSchema,
  sepayGatewaySettingsFormSchema,
  themeConfigSchema,
  type DomainResponse,
  type TenantThemeResponse,
  payoutPolicySchema,
} from '@booking/contracts';
import { apiDelete, apiPatch, apiPost, apiPut, type ApiAuth } from '~/lib/api.server';
import { TENANT_FLAGS_PATH, type TenantFlags } from '~/features/tenant/lib/flags';

/**
 * The tenant settings route's multi-intent action, kept out of the route module.
 * Handles: theme save + domain add (JSON via GenericForm), and the formData
 * intents (partner-promotions flag toggle, domain verify, domain delete).
 */
export async function handleSettingsAction(request: Request, auth: ApiAuth) {
  const contentType = request.headers.get('content-type') ?? '';

  // Both the theme editor and the domain-add form submit JSON via GenericForm.
  // They carry disjoint keys, so `hostname` disambiguates the domain payload.
  if (contentType.includes('application/json')) {
    const body: unknown = await request.json();

    if (body && typeof body === 'object' && 'gateway' in body) {
      const raw = body as {
        environment?: unknown;
        credentials?: { merchantId?: unknown; secretKey?: unknown };
      };
      const parsed = sepayGatewaySettingsFormSchema.safeParse({
        environment: raw.environment,
        merchantId: raw.credentials?.merchantId,
        secretKey: raw.credentials?.secretKey,
      });
      if (!parsed.success) {
        return routeData(
          { form: 'sepay', fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPut(
        '/tenant/gateway-config',
        {
          gateway: 'sepay',
          environment: parsed.data.environment,
          credentials: {
            merchantId: parsed.data.merchantId,
            secretKey: parsed.data.secretKey,
          },
        },
        auth,
      );
      if (!res.ok) {
        return routeData(
          { form: 'sepay', error: res.error ?? 'Không lưu được cấu hình SePay.' },
          { status: res.status >= 400 && res.status <= 599 ? res.status : 400 },
        );
      }
      return { form: 'sepay', ok: true };
    }

    if (body && typeof body === 'object' && 'hostname' in body) {
      const parsed = addDomainInputSchema.safeParse(body);
      if (!parsed.success) {
        return routeData(
          { form: 'domain', fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPost<DomainResponse>('/tenant/domains', parsed.data, auth);
      if (!res.ok)
        return routeData(
          { form: 'domain', error: res.error ?? 'Không thêm được tên miền.' },
          { status: 400 },
        );
      return { form: 'domain', ok: true };
    }

    const parsed = themeConfigSchema.safeParse(body);
    if (!parsed.success) {
      return routeData(
        { form: 'theme', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const res = await apiPatch<TenantThemeResponse>(
      '/tenant/theme',
      { themeConfig: parsed.data },
      auth,
    );
    if (!res.ok)
      return routeData(
        { form: 'theme', error: res.error ?? 'Không lưu được giao diện.' },
        { status: 400 },
      );
    return { form: 'theme', ok: true };
  }

  const formData = await request.formData();
  const intent = String(formData.get('intent'));

  if (intent === 'toggle-partner-promos') {
    const enabled = formData.get('partnerPromotionsEnabled') === 'true';
    const res = await apiPatch<TenantFlags>(
      TENANT_FLAGS_PATH,
      { partnerPromotionsEnabled: enabled },
      auth,
    );
    if (!res.ok)
      return routeData(
        { form: 'flags', error: res.error ?? 'Không lưu được cài đặt.' },
        { status: 400 },
      );
    return { form: 'flags', ok: true };
  }

  if (intent === 'payout-policy') {
    const parsed = payoutPolicySchema.safeParse({
      holdingDays: Number(formData.get('holdingDays')),
      minAmount: String(formData.get('minAmount') ?? ''),
      cycle: String(formData.get('cycle') ?? ''),
    });
    if (!parsed.success) {
      return routeData(
        { form: 'payout-policy', error: 'Chính sách chi trả không hợp lệ.' },
        { status: 400 },
      );
    }
    const res = await apiPut('/tenant/finance/payout-policy', parsed.data, auth);
    if (!res.ok) {
      return routeData(
        { form: 'payout-policy', error: res.error ?? 'Không lưu được chính sách chi trả.' },
        { status: 400 },
      );
    }
    return { form: 'payout-policy', ok: true };
  }

  if (intent === 'set-default-cancellation-policy') {
    const raw = String(formData.get('policyId') ?? '');
    const res = await apiPatch(
      '/tenant/settings/default-cancellation-policy',
      { policyId: raw === '' ? null : raw },
      auth,
    );
    if (!res.ok)
      return routeData(
        { form: 'cancellation-default', error: res.error ?? 'Không lưu được chính sách mặc định.' },
        { status: 400 },
      );
    return { form: 'cancellation-default', ok: true };
  }

  if (intent === 'verify-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiPost<DomainResponse>(`/tenant/domains/${id}/verify`, {}, auth);
    if (!res.ok)
      return routeData(
        { form: 'verify', error: res.error ?? 'Xác minh thất bại. Kiểm tra bản ghi TXT.' },
        { status: 400 },
      );
    return { form: 'verify', ok: true };
  }

  if (intent === 'delete-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiDelete(`/tenant/domains/${id}`, auth);
    if (!res.ok)
      return routeData(
        { form: 'verify', error: res.error ?? 'Không xoá được tên miền.' },
        { status: 400 },
      );
    return { form: 'verify', ok: true };
  }

  return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}
