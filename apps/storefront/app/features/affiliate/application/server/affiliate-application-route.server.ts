import { affiliateRegistrationSchema } from '@booking/contracts';
import { data } from 'react-router';
import { applyAsAffiliate } from '../../../../lib/affiliate.server';
import { storefrontEnv } from '../../../../lib/env.server';
import { errorStatus } from '../../../../lib/http-status';
import { registerOrLogin } from '../../../../lib/partner.server';
import { getCurrentStorefrontTenant } from '../../../../lib/request-context.server';

export function loadAffiliateApplicationRoute() {
  const tenant = getCurrentStorefrontTenant();
  return {
    tenantName: tenant.name,
    tenantLogoUrl: tenant.themeConfig.logoUrl || null,
    dashboardUrl: storefrontEnv.dashboardUrl,
  };
}

export async function submitAffiliateApplication(request: Request) {
  const tenant = getCurrentStorefrontTenant();
  const parsed = affiliateRegistrationSchema.safeParse(await request.json());

  if (!parsed.success) {
    return data(
      { fieldErrors: parsed.error.flatten().fieldErrors, error: null, ok: false },
      { status: 400 },
    );
  }

  const values = parsed.data;
  const auth = await registerOrLogin(request, {
    email: values.email.trim(),
    password: values.password,
    fullName: values.fullName.trim(),
    ...(values.phone?.trim() ? { phone: values.phone.trim() } : {}),
  });

  if (!auth.ok) {
    return data(
      { fieldErrors: null, error: auth.code, ok: false },
      { status: errorStatus(auth.status) },
    );
  }

  const payoutInfo: { bankName?: string; accountNo?: string; accountHolder?: string } = {};
  if (values.bankName?.trim()) payoutInfo.bankName = values.bankName.trim();
  if (values.accountNo?.trim()) payoutInfo.accountNo = values.accountNo.trim();
  if (values.accountHolder?.trim()) payoutInfo.accountHolder = values.accountHolder.trim();

  const applied = await applyAsAffiliate(request, auth.token, {
    tenantId: tenant.id,
    payoutInfo,
  });

  if (!applied.ok) {
    return data(
      { fieldErrors: null, error: applied.code, ok: false },
      { status: errorStatus(applied.status) },
    );
  }

  return { fieldErrors: null, error: null, ok: true as const };
}
