import { affiliateRegistrationSchema } from '@booking/contracts';
import { readJsonRequestBody } from '~/lib/server/json-request.server';
import { data } from 'react-router';
import { applyAsAffiliate } from '~/features/affiliate/server/affiliate.server';
import { storefrontEnv } from '~/lib/server/env.server';
import { errorStatus } from '~/lib/http-status';
import { requireLocale } from '~/lib/server/i18n.server';
import { loadLegalConsentBundle } from '~/features/legal/server/legal.server';
import { registerOrLogin } from '~/features/partner-onboarding/server/partner.server';
import { getCurrentStorefrontTenant } from '~/lib/server/request-context.server';

/** Per D6, an affiliate application's one consent tick covers all three documents. */
const AFFILIATE_APPLICATION_LEGAL_TYPES = ['affiliate_terms', 'customer_terms', 'privacy_policy'] as const;

export async function loadAffiliateApplicationRoute(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const tenant = getCurrentStorefrontTenant();
  const legalConsent = await loadLegalConsentBundle(request, locale, AFFILIATE_APPLICATION_LEGAL_TYPES);
  return {
    tenantName: tenant.name,
    tenantLogoUrl: tenant.themeConfig.logoUrl || null,
    dashboardUrl: storefrontEnv.dashboardUrl,
    legalConsent,
  };
}

export async function submitAffiliateApplication(request: Request) {
  const tenant = getCurrentStorefrontTenant();
  // Through the bounded reader: an unparseable or oversized body becomes  and
  // falls out of the schema as the same 400 a malformed payload already produced.
  const body = await readJsonRequestBody(request);
  const parsed = affiliateRegistrationSchema.safeParse(body.ok ? body.value : {});

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
    legalConsent: {
      acceptedVersionIds: values.acceptedVersionIds,
      acceptedLocale: values.acceptedLocale,
    },
  });

  if (!applied.ok) {
    return data(
      { fieldErrors: null, error: applied.code, ok: false },
      { status: errorStatus(applied.status) },
    );
  }

  return { fieldErrors: null, error: null, ok: true as const };
}
