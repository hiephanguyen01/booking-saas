import {
  completePartnerPassword,
  requirePartnerPhaseOnly,
} from '../../../../lib/partner-onboarding.server';

export function loadPartnerPasswordRoute(request: Request, locale?: string) {
  return requirePartnerPhaseOnly(request, 'partner_registration_password', locale);
}

export function submitPartnerPasswordRoute(request: Request, locale?: string) {
  return completePartnerPassword(request, locale);
}
