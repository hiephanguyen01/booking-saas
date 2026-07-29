import type { Locale } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import {
  flowView,
  type AuthFlowPhase,
  type AuthFlowView,
} from '~/features/auth/server/auth-flow.server';
import { requireFlowPhase } from '~/features/auth/server/auth-routes.server';

/**
 * Partner onboarding walks the same OTP flow as customer registration, on the
 * same `auth-flow.server` store — so the form quartet, the error envelopes and
 * the phase gates all come from `features/auth/server`. The only thing this
 * feature owns is where an out-of-phase visitor is sent back to.
 */
export type { AuthActionData as PartnerOnboardingActionData } from '~/lib/auth-types';
export {
  failedAuthForm as failedPartnerFormData,
  failedAuthRequest as failedPartnerOnboarding,
  formFields as partnerFormFields,
  invalidAuthInput as invalidPartnerOnboarding,
  readAuthForm as readPartnerFormData,
} from '~/features/auth/server/auth-form.server';

const partnerFallback = (locale: Locale) => storefrontPaths.becomePartner(locale);

/**
 * Server-side flow accessor. The returned record may contain a completion token,
 * so route loaders must expose it only through `requirePartnerView`.
 */
export async function requirePartnerPhase(request: Request, phase: AuthFlowPhase, locale: Locale) {
  return requireFlowPhase(request, phase, partnerFallback(locale));
}

export async function requirePartnerView(
  request: Request,
  phase: AuthFlowPhase,
  locale: Locale,
): Promise<AuthFlowView> {
  return flowView(await requirePartnerPhase(request, phase, locale));
}

export async function requirePartnerPhaseOnly(
  request: Request,
  phase: AuthFlowPhase,
  locale: Locale,
): Promise<null> {
  await requirePartnerPhase(request, phase, locale);
  return null;
}
