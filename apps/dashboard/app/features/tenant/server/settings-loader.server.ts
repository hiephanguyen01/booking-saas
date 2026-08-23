import {
  gatewayConfigsResponseSchema,
  paymentRoutingResponseSchema,
  tenantRefundPolicySchema,
  type CancellationPolicyResponse,
  type DomainResponse,
  type PayoutPolicyDto,
  type TenancyConfigResponse,
  type TenantThemeResponse,
} from '@booking/contracts';
import { apiGet } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { fetchTenantLegalOverview } from '~/features/legal/server/legal.server';
import {
  TENANT_FLAGS_PATH,
  toPartnerPromotionsState,
  type TenantFlags,
} from '~/features/tenant/lib/flags';

/**
 * Read path for the tenant settings screen. Every panel is permission-gated, so
 * the loader fetches only what this member may see and reports each failure
 * separately — one dead endpoint must not blank the whole page.
 */

function apiError(result: { ok: boolean; error?: string } | null, fallback: string): string | null {
  return result && !result.ok ? (result.error ?? fallback) : null;
}

export async function loadTenantSettings(request: Request) {
  const { auth, can } = await requireTenant(request);
  const canTheme = can('tenant.theme.manage');
  const canSettings = can('tenant.settings.manage');
  const canFinance = can('tenant.finance.read');
  const canLegal = can('tenant.legal.manage');

  const [
    themeRes,
    domainsRes,
    tenancyConfigRes,
    flagsRes,
    policiesRes,
    gatewayRes,
    paymentRoutingRes,
    refundPolicyRes,
    payoutPolicyRes,
    legalRes,
  ] = await Promise.all([
    canTheme ? apiGet<TenantThemeResponse>(apiPaths.tenant.theme, auth) : Promise.resolve(null),
    canSettings ? apiGet<DomainResponse[]>(apiPaths.tenant.domains, auth) : Promise.resolve(null),
    canSettings
      ? apiGet<TenancyConfigResponse>(apiPaths.tenant.tenancyConfig, auth)
      : Promise.resolve(null),
    canSettings ? apiGet<TenantFlags>(TENANT_FLAGS_PATH, auth) : Promise.resolve(null),
    canSettings
      ? apiGet<CancellationPolicyResponse[]>(apiPaths.tenant.cancellationPolicies, auth)
      : Promise.resolve(null),
    canSettings
      ? apiGet(apiPaths.tenant.gatewayConfig, auth, { schema: gatewayConfigsResponseSchema })
      : Promise.resolve(null),
    canSettings
      ? apiGet(apiPaths.tenant.paymentRouting, auth, { schema: paymentRoutingResponseSchema })
      : Promise.resolve(null),
    canSettings
      ? apiGet(apiPaths.tenant.refundPolicy, auth, { schema: tenantRefundPolicySchema })
      : Promise.resolve(null),
    canFinance ? apiGet<PayoutPolicyDto>(apiPaths.tenant.payoutPolicy, auth) : Promise.resolve(null),
    canLegal ? fetchTenantLegalOverview(auth) : Promise.resolve(null),
  ]);

  return {
    theme: themeRes?.ok ? themeRes.data : null,
    themeError: apiError(themeRes, 'Không tải được cấu hình thương hiệu.'),
    domains: domainsRes?.ok ? (domainsRes.data ?? []) : null,
    domainsError: apiError(domainsRes, 'Không tải được danh sách tên miền.'),
    tenancyConfig: tenancyConfigRes?.ok ? (tenancyConfigRes.data ?? null) : null,
    canTheme,
    canSettings,
    canFinance,
    canLegal,
    partnerPromotions: toPartnerPromotionsState(flagsRes),
    cancellationPolicies: policiesRes?.ok ? (policiesRes.data ?? []) : null,
    cancellationPoliciesError: apiError(policiesRes, 'Không tải được chính sách huỷ.'),
    gatewayConfigs: gatewayRes?.ok ? (gatewayRes.data ?? []) : null,
    gatewayError: apiError(gatewayRes, 'Không tải được cấu hình provider thanh toán.'),
    paymentRouting: paymentRoutingRes?.ok ? (paymentRoutingRes.data ?? null) : null,
    paymentRoutingError: apiError(paymentRoutingRes, 'Không tải được định tuyến thanh toán.'),
    refundPolicy: refundPolicyRes?.ok ? (refundPolicyRes.data ?? null) : null,
    refundPolicyError: apiError(refundPolicyRes, 'Không tải được chính sách hoàn tiền.'),
    payoutPolicy: payoutPolicyRes?.ok ? (payoutPolicyRes.data ?? null) : null,
    payoutPolicyError: apiError(payoutPolicyRes, 'Không tải được chính sách chi trả.'),
    canManagePayoutPolicy: can('tenant.payouts.manage'),
    legal: legalRes?.ok ? legalRes.data : null,
    legalError: apiError(legalRes, 'Không tải được dữ liệu pháp lý.'),
  };
}