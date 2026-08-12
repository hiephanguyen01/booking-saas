import { data as routeData } from 'react-router';
import {
  addDomainInputSchema,
  momoGatewaySettingsFormSchema,
  sepayGatewaySettingsFormSchema,
  zalopayGatewaySettingsFormSchema,
  themeConfigSchema,
  tenantThemeResponseSchema,
  domainDnsCheckResponseSchema,
  type DomainDnsCheckResponse,
  type DomainResponse,
  type TenantDomainKind,
  type TenantThemeResponse,
  payoutPolicySchema,
  updateGatewayPaymentSettingsInputSchema,
  createCancellationPolicyInputSchema,
  gatewayConfigResponseSchema,
  type GatewayConfigResponse,
  type UpsertGatewayConfigInput,
} from '@booking/contracts';
import { apiDelete, apiPatch, apiPost, apiPut, type ApiAuth } from '~/lib/api.server';
import { TENANT_FLAGS_PATH, type TenantFlags } from '~/features/tenant/lib/flags';
import { handleLegalSettingsAction, isLegalIntent } from '~/features/legal/server/legal.server';
import { apiPaths } from '~/constants/api-paths';
import { actionMessages } from '~/constants/messages';

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

      if (isLegalIntent(intent)) {
        return handleLegalSettingsAction(intent, body, auth);
      }

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
            ? await apiPost(apiPaths.tenant.cancellationPolicies, parsed.data, auth)
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
        const payload: UpsertGatewayConfigInput = {
          gateway: 'zalopay',
          environment: parsed.data.environment,
          credentials: {
            appId: parsed.data.appId,
            key1: parsed.data.key1,
            key2: parsed.data.key2,
          },
        };
        const res = await apiPut<GatewayConfigResponse>(apiPaths.tenant.gatewayConfig, payload, auth, {
          schema: gatewayConfigResponseSchema,
        });
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
        const payload: UpsertGatewayConfigInput = {
          gateway: 'momo',
          environment: parsed.data.environment,
          credentials: {
            partnerCode: parsed.data.partnerCode,
            accessKey: parsed.data.accessKey,
            secretKey: parsed.data.secretKey,
          },
        };
        const res = await apiPut<GatewayConfigResponse>(apiPaths.tenant.gatewayConfig, payload, auth, {
          schema: gatewayConfigResponseSchema,
        });
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
      const payload: UpsertGatewayConfigInput = {
        gateway: 'sepay',
        environment: parsed.data.environment,
        credentials: {
          merchantId: parsed.data.merchantId,
          secretKey: parsed.data.secretKey,
        },
      };
      const res = await apiPut<GatewayConfigResponse>(apiPaths.tenant.gatewayConfig, payload, auth, {
        schema: gatewayConfigResponseSchema,
      });
      if (!res.ok) {
        return routeData(
          { form: 'sepay', error: res.error ?? 'Không lưu được cấu hình SePay.' },
          { status: res.status >= 400 && res.status <= 599 ? res.status : 400 },
        );
      }
      return { form: 'sepay', ok: true };
    }

    if (body && typeof body === 'object' && 'hostname' in body) {
      // Echoed back on every branch below: the route renders two domain cards
      // (storefront/dashboard) from this one action, so each needs to tell
      // whether a given response is its own before showing it.
      const rawKind = (body as { kind?: unknown }).kind;
      const kind: TenantDomainKind = rawKind === 'dashboard' ? 'dashboard' : 'storefront';

      const parsed = addDomainInputSchema.safeParse(body);
      if (!parsed.success) {
        return routeData(
          { form: 'domain', kind, fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPost<DomainResponse>(apiPaths.tenant.domains, parsed.data, auth);
      if (!res.ok) {
        // The backend's DomainError message is English; map the two prefix
        // rules to Vietnamese so they read naturally on this Vietnamese-only
        // screen (the same `res.code` pattern as tenant-detail-actions.server.ts's
        // DOMAIN_PRIMARY_REQUIRED mapping). Any other code falls back to the
        // raw message.
        const message =
          res.code === 'ADMIN_DOMAIN_PREFIX_REQUIRED'
            ? 'Tên miền trang quản trị phải bắt đầu bằng "admin.".'
            : res.code === 'ADMIN_PREFIX_RESERVED'
              ? 'Tiền tố "admin." được dành riêng cho tên miền trang quản trị.'
              : (res.error ?? 'Không thêm được tên miền.');
        return routeData({ form: 'domain', kind, error: message }, { status: 400 });
      }
      return { form: 'domain', kind, ok: true };
    }

    const parsed = themeConfigSchema.safeParse(body);
    if (!parsed.success) {
      return routeData(
        { form: 'theme', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const res = await apiPatch<TenantThemeResponse>(
      apiPaths.tenant.theme,
      { themeConfig: parsed.data },
      auth,
      { schema: tenantThemeResponseSchema },
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
    const res = await apiPut(apiPaths.tenant.gatewayConfigSettings, parsed.data, auth);
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
    const res = await apiPut(apiPaths.tenant.payoutPolicy, parsed.data, auth);
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
      apiPaths.tenant.defaultCancellationPolicy,
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
    const res = await apiDelete(apiPaths.tenant.cancellationPolicy(id), auth);
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
    const res = await apiPost<DomainResponse>(apiPaths.tenant.domainVerify(id), {}, auth);
    if (!res.ok)
      return routeData(
        {
          form: 'domain-verify',
          domainId: id,
          error: res.error ?? 'Xác minh thất bại. Kiểm tra bản ghi TXT.',
        },
        { status: 400 },
      );
    return { form: 'domain-verify', domainId: id, ok: true };
  }

  if (intent === 'dns-check-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiPost<DomainDnsCheckResponse>(
      apiPaths.tenant.domainDnsCheck(id),
      {},
      auth,
      { schema: domainDnsCheckResponseSchema },
    );
    if (!res.ok || !res.data) {
      return routeData(
        {
          form: 'domain-dns-check',
          domainId: id,
          error: res.error ?? 'Không kiểm tra được kết nối tên miền.',
        },
        { status: 400 },
      );
    }
    // The domainId travels back so the card can render the result inside the row
    // that was checked, instead of as one banner for the whole list.
    return { form: 'domain-dns-check', ok: true, domainId: id, dnsCheck: res.data };
  }

  if (intent === 'set-primary-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiPatch<DomainResponse>(apiPaths.tenant.domainPrimary(id), {}, auth);
    if (!res.ok) {
      return routeData(
        {
          form: 'domain-primary',
          domainId: id,
          error: res.error ?? 'Không đặt được tên miền chính.',
        },
        { status: 400 },
      );
    }
    return { form: 'domain-primary', domainId: id, ok: true };
  }

  if (intent === 'delete-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiDelete(apiPaths.tenant.domain(id), auth);
    if (!res.ok)
      return routeData(
        { form: 'domain-delete', domainId: id, error: res.error ?? 'Không xoá được tên miền.' },
        { status: 400 },
      );
    return { form: 'domain-delete', domainId: id, ok: true };
  }

  return routeData({ error: actionMessages.invalidIntent }, { status: 400 });
}
