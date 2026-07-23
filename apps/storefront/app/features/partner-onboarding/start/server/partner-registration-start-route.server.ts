import { startPartnerRegistration } from '../../../../lib/partner-onboarding.server';

export function submitPartnerRegistrationStartRoute(request: Request, locale?: string) {
  return startPartnerRegistration(request, locale);
}
