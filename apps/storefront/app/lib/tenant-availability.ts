import { pathLocale } from '~/constants/paths';
import { localeTranslator } from '~/lib/translator';

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

  const locale = pathLocale(new URL(request.url).pathname);
  const message = localeTranslator(locale).t('errors.tenantUnavailable');

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
