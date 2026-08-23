import { data as routeData } from 'react-router';
import {
  addDomainInputSchema,
  momoGatewaySettingsFormSchema,
  payosGatewaySettingsFormSchema,
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
  customerPaymentMethodSchema,
  paymentRoutingInputSchema,
  updateTenantRefundPolicyInputSchema,
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

type PayosWebhookConfirmation = { verified: true; webhookUrl: string };

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
          clientId?: unknown;
          apiKey?: unknown;
          checksumKey?: unknown;
          appId?: unknown;
          key1?: unknown;
          key2?: unknown;
        };
      };

      if (raw.gateway === 'payos') {
        const parsed = payosGatewaySettingsFormSchema.safeParse({
          environment: 'production',
          clientId: raw.credentials?.clientId,
          apiKey: raw.credentials?.apiKey,
          checksumKey: raw.credentials?.checksumKey,
        });
        if (!parsed.success) {
          return routeData(
            { form: 'payos', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }
        const payload: UpsertGatewayConfigInput = {
          gateway: 'payos',
          environment: 'production',
          credentials: {
            clientId: parsed.data.clientId,
            apiKey: parsed.data.apiKey,
            checksumKey: parsed.data.checksumKey,
          },
        };
        const res = await apiPut<GatewayConfigResponse>(apiPaths.tenant.gatewayConfig, payload, auth, {
          schema: gatewayConfigResponseSchema,
        });
        if (!res.ok) {
          return routeData(
            { form: 'payos', error: res.error ?? 'Không lưu được cấu hình PayOS.' },
            { status: res.status >= 400 && res.status <= 599 ? res.status : 400 },
          );
        }
        return { form: 'payos', ok: true };
      }

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
  // Row actions carry the card's own `kind` (set by `submitDomainAction`), echoed
  // back below on every domain-row branch — success and error alike — for the
  // same reason the domain-add branch echoes it: neither card knows a response
  // is its own otherwise. Unlike `domainId`, `kind` still resolves after a
  // successful delete removes the row, so it — not `domainId` — is what each
  // card uses to decide banner ownership (`tenant-domains-card.tsx`).
  const domainRowKind: TenantDomainKind =
    formData.get('kind') === 'dashboard' ? 'dashboard' : 'storefront';

  if (intent === 'confirm-payos-webhook') {
    const res = await apiPost<PayosWebhookConfirmation>(apiPaths.tenant.payosConfirmWebhook, {}, auth);
    if (
      !res.ok ||
      !res.data ||
      res.data.verified !== true ||
      typeof res.data.webhookUrl !== 'string'
    ) {
      return routeData(
        {
          form: 'payos-webhook',
          error: res.error ?? 'Không xác nhận được webhook PayOS.',
        },
        { status: res.status >= 400 && res.status <= 599 ? res.status : 400 },
      );
    }
    return { form: 'payos-webhook', ok: true, webhookUrl: res.data.webhookUrl };
  }

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

  if (intent === 'payment-routing') {
    const enabled = new Set(formData.getAll('enabledMethods').map(String));
    const routes = customerPaymentMethodSchema.options.flatMap((method) => {
      const gateway = String(formData.get(`gateway:${method}`) ?? '').trim();
      return gateway ? [{ method, gateway, enabled: enabled.has(method) }] : [];
    });
    const parsed = paymentRoutingInputSchema.safeParse({ routes });
    if (!parsed.success) {
      return routeData(
        { form: 'payment-routing', error: 'Định tuyến phương thức thanh toán không hợp lệ.' },
        { status: 400 },
      );
    }
    const res = await apiPut(apiPaths.tenant.paymentRouting, parsed.data, auth);
    if (!res.ok) {
      return routeData(
        { form: 'payment-routing', error: res.error ?? 'Không lưu được định tuyến thanh toán.' },
        { status: 400 },
      );
    }
    return { form: 'payment-routing', ok: true };
  }

  if (intent === 'refund-policy') {
    const parsed = updateTenantRefundPolicyInputSchema.safeParse({
      refundStrategy: formData.get('refundStrategy'),
      manualRefundSlaHours: Number(formData.get('manualRefundSlaHours')),
    });
    if (!parsed.success) {
      return routeData(
        { form: 'refund-policy', error: 'Chính sách hoàn tiền không hợp lệ.' },
        { status: 400 },
      );
    }
    const res = await apiPut(apiPaths.tenant.refundPolicy, parsed.data, auth);
    if (!res.ok) {
      return routeData(
        { form: 'refund-policy', error: res.error ?? 'Không lưu được chính sách hoàn tiền.' },
        { status: 400 },
      );
    }
    return { form: 'refund-policy', ok: true };
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
          kind: domainRowKind,
          domainId: id,
          error: res.error ?? 'Xác minh thất bại. Kiểm tra bản ghi TXT.',
        },
        { status: 400 },
      );
    return { form: 'domain-verify', kind: domainRowKind, domainId: id, ok: true };
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
          kind: domainRowKind,
          domainId: id,
          error: res.error ?? 'Không kiểm tra được kết nối tên miền.',
        },
        { status: 400 },
      );
    }
    // The domainId travels back so the card can render the result inside the row
    // that was checked, instead of as one banner for the whole list.
    return { form: 'domain-dns-check', kind: domainRowKind, ok: true, domainId: id, dnsCheck: res.data };
  }

  if (intent === 'set-primary-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiPatch<DomainResponse>(apiPaths.tenant.domainPrimary(id), {}, auth);
    if (!res.ok) {
      return routeData(
        {
          form: 'domain-primary',
          kind: domainRowKind,
          domainId: id,
          error: res.error ?? 'Không đặt được tên miền chính.',
        },
        { status: 400 },
      );
    }
    return { form: 'domain-primary', kind: domainRowKind, domainId: id, ok: true };
  }

  if (intent === 'delete-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiDelete(apiPaths.tenant.domain(id), auth);
    if (!res.ok)
      return routeData(
        {
          form: 'domain-delete',
          kind: domainRowKind,
          domainId: id,
          error: res.error ?? 'Không xoá được tên miền.',
        },
        { status: 400 },
      );
    // `kind` (not `domainId`) is what the card uses to claim this banner — a
    // successful delete removes the row from `domains`, so `domainId` would no
    // longer match anything in either card's `rows` by the time this re-renders.
    return { form: 'domain-delete', kind: domainRowKind, domainId: id, ok: true };
  }

  return routeData({ error: actionMessages.invalidIntent }, { status: 400 });
}
