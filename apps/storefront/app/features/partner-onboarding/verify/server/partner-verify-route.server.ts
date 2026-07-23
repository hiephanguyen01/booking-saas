import {
  requirePartnerView,
  verifyPartnerRegistration,
} from '../../../../lib/partner-onboarding.server';

export function loadPartnerVerifyRoute(request: Request, locale: string) {
  return requirePartnerView(request, 'partner_registration_verify', locale);
}

export function submitPartnerVerifyRoute(request: Request, locale: string) {
  return verifyPartnerRegistration(request, locale);
}
