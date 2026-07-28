import { createTranslator } from '@booking/i18n';
import { localeParam } from '~/constants/paths';

export const TENANT_UNAVAILABLE_STATUS = 423;

export interface TenantAvailability {
  live: boolean;
  name: string;
}

export function tenantUnavailableResponse(
  request: Request,
  tenant: TenantAvailability,
): Response | null {
  if (tenant.live) return null;

  const firstSegment = new URL(request.url).pathname.split('/').filter(Boolean)[0];
  const locale = localeParam(firstSegment);
  const message = createTranslator(locale).t('errors.tenantUnavailable');

  return Response.json(
    { code: 'TENANT_UNAVAILABLE', tenantName: tenant.name, locale, message },
    {
      status: TENANT_UNAVAILABLE_STATUS,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Language': locale,
      },
    },
  );
}
