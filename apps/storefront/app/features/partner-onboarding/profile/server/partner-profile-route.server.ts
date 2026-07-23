import {
  loadPartnerProfile,
  submitPartnerProfile,
} from '../../../../lib/partner-onboarding.server';

export function loadPartnerProfileRoute(request: Request, locale: string) {
  return loadPartnerProfile(request, locale);
}

export function submitPartnerProfileRoute(request: Request, locale: string) {
  return submitPartnerProfile(request, locale);
}
