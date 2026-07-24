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
  const locale = firstSegment === 'en' ? 'en' : 'vi';
  const message =
    locale === 'en'
      ? 'This storefront is currently unavailable. Please try again later.'
      : 'Cửa hàng hiện đang tạm ngưng hoạt động. Vui lòng quay lại sau.';

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
