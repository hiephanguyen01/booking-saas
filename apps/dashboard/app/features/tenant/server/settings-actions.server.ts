import { data as routeData } from 'react-router';
import {
  addDomainInputSchema,
  momoGatewaySettingsFormSchema,
  sepayGatewaySettingsFormSchema,
  zalopayGatewaySettingsFormSchema,
  themeConfigSchema,
  type DomainResponse,
  type TenantThemeResponse,
  payoutPolicySchema,
  updateGatewayPaymentSettingsInputSchema,
  createCancellationPolicyInputSchema,
} from '@booking/contracts';
import { apiDelete, apiPatch, apiPost, apiPut, type ApiAuth } from '~/lib/api.server';
import { TENANT_FLAGS_PATH, type TenantFlags } from '~/features/tenant/lib/flags';

/**
 * The tenant settings route's multi-intent action, kept out of the route module.
 * Handles every settings mutation while keeping the route module focused on composition.
 */
export async function handleSettingsAction(request: Request, auth: ApiAuth) {
  const contentType = request.headers.get('content-type') ?? '';

  // Both the theme editor and the domain-add form submit JSON via GenericForm.
  // They carry disjoint keys, so `hostname` disambiguates the domain payload.
  if (contentType.includes('application/json')) {
    const body: unknown = await request.json();

    if (body && typeof body === 'object' && 'intent' in body) {
      const intent = String((body as { intent?: unknown }).intent ?? '');
      if (
        intent === 'create-tenant-cancellation-policy' ||
        intent === 'update-tenant-cancellation-policy'
      ) {
        const form =
          intent === 'create-tenant-cancellation-policy'
            ? 'cancellation-policy-create'
            : 'cancellation-policy-update';
        const parsed = createCancellationPolicyInputSchema.safeParse(body);
        if (!parsed.success) {
          return routeData(
            { form, fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }
        const res =
          intent === 'create-tenant-cancellation-policy'
            ? await apiPost('/tenant/cancellation-policies', parsed.data, auth)
            : await apiPatch(
                `/tenant/cancellation-policies/${String((body as { policyId?: unknown }).policyId ?? '')}`,
                parsed.data,
                auth,
              );
        if (!res.ok) {
          return routeData(
            {
              form,
              error:
                res.error ??
                (intent === 'create-tenant-cancellation-policy'
                  ? 'Không tạo được chính sách huỷ.'
                  : 'Không lưu được chính sách huỷ.'),
            },
            { status: 400 },
          );
        }
        return { form, ok: true };
      }
    }

    if (body && typeof body === 'object' && 'gateway' in body) {
      const raw = body as {
        gateway?: unknown;
        environment?: unknown;
        credentials?: {
          merchantId?: unknown;
          secretKey?: unknown;
          partnerCode?: unknown;
          accessKey?: unknown;
          appId?: unknown;
          key1?: unknown;
          key2?: unknown;
        };
      };

      if (raw.gateway === 'zalopay') {
        const parsed = zalopayGatewaySettingsFormSchema.safeParse({
          environment: raw.environment,
          appId: raw.credentials?.appId,
          key1: raw.credentials?.key1,
          key2: raw.credentials?.key2,
        });
        if (!parsed.success) {
          return routeData(
            { form: 'zalopay', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }
        const res = await apiPut(
          '/tenant/gateway-config',
          {
            gateway: 'zalopay',
            environment: parsed.data.environment,
            credentials: {
              appId: parsed.data.appId,
              key1: parsed.data.key1,
              key2: parsed.data.key2,
            },
          },
          auth,
        );
        if (!res.ok) {
          return routeData(
            { form: 'zalopay', error: res.error ?? 'Không lưu được cấu hình ZaloPay.' },
            { status: res.status >= 400 && res.status <= 599 ? res.status : 400 },
          );
        }
        return { form: 'zalopay', ok: true };
      }

      if (raw.gateway === 'momo') {
        const parsed = momoGatewaySettingsFormSchema.safeParse({
          environment: raw.environment,
          partnerCode: raw.credentials?.partnerCode,
          accessKey: raw.credentials?.accessKey,
          secretKey: raw.credentials?.secretKey,
        });
        if (!parsed.success) {
          return routeData(
            { form: 'momo', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }
        const res = await apiPut(
          '/tenant/gateway-config',
          {
            gateway: 'momo',
            environment: parsed.data.environment,
            credentials: {
              partnerCode: parsed.data.partnerCode,
              accessKey: parsed.data.accessKey,
              secretKey: parsed.data.secretKey,
            },
          },
          auth,
        );
        if (!res.ok) {
          return routeData(
            { form: 'momo', error: res.error ?? 'Không lưu được cấu hình MoMo.' },
            { status: res.status >= 400 && res.status <= 599 ? res.status : 400 },
          );
        }
        return { form: 'momo', ok: true };
      }

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

  if (intent === 'disable-gateway') {
    const gateway = String(formData.get('gateway') ?? '').trim();
    const res = await apiDelete(
      `/tenant/gateway-config${gateway ? `?gateway=${encodeURIComponent(gateway)}` : ''}`,
      auth,
    );
    if (!res.ok)
      return routeData(
        { form: 'gateway-off', error: res.error ?? 'Không tắt được cổng thanh toán.' },
        { status: 400 },
      );
    return { form: 'gateway-off', ok: true };
  }

  if (intent === 'payment-settings') {
    const parsed = updateGatewayPaymentSettingsInputSchema.safeParse({
      gateway: formData.get('gateway'),
      enabledMethods: formData.getAll('enabledMethods'),
      refundStrategy: formData.get('refundStrategy'),
      manualRefundSlaHours: Number(formData.get('manualRefundSlaHours')),
    });
    if (!parsed.success) {
      return routeData(
        { form: 'payment-settings', error: 'Hãy bật ít nhất một phương thức thanh toán.' },
        { status: 400 },
      );
    }
    const res = await apiPut('/tenant/gateway-config/settings', parsed.data, auth);
    if (!res.ok) {
      return routeData(
        { form: 'payment-settings', error: res.error ?? 'Không lưu được cài đặt thanh toán.' },
        { status: 400 },
      );
    }
    return { form: 'payment-settings', ok: true };
  }

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

  if (intent === 'delete-tenant-cancellation-policy') {
    const id = String(formData.get('policyId') ?? '');
    const res = await apiDelete(`/tenant/cancellation-policies/${id}`, auth);
    if (!res.ok) {
      return routeData(
        {
          form: 'cancellation-policy-delete',
          error:
            res.error ??
            'Không xoá được chính sách. Hãy kiểm tra các tin đăng đang sử dụng chính sách này.',
        },
        { status: 400 },
      );
    }
    return { form: 'cancellation-policy-delete', ok: true };
  }

  if (intent === 'verify-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiPost<DomainResponse>(`/tenant/domains/${id}/verify`, {}, auth);
    if (!res.ok)
      return routeData(
        { form: 'domain-verify', error: res.error ?? 'Xác minh thất bại. Kiểm tra bản ghi TXT.' },
        { status: 400 },
      );
    return { form: 'domain-verify', ok: true };
  }

  if (intent === 'set-primary-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiPatch<DomainResponse>(`/tenant/domains/${id}/primary`, {}, auth);
    if (!res.ok) {
      return routeData(
        { form: 'domain-primary', error: res.error ?? 'Không đặt được tên miền chính.' },
        { status: 400 },
      );
    }
    return { form: 'domain-primary', ok: true };
  }

  if (intent === 'delete-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiDelete(`/tenant/domains/${id}`, auth);
    if (!res.ok)
      return routeData(
        { form: 'domain-delete', error: res.error ?? 'Không xoá được tên miền.' },
        { status: 400 },
      );
    return { form: 'domain-delete', ok: true };
  }

  return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}
