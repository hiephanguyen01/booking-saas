import {
  administrativeProvinceListSchema,
  administrativeWardListSchema,
  listAdministrativeWardsQuerySchema,
  type AdministrativeProvince,
  type AdministrativeWard,
} from '@booking/contracts';
import { localeTranslator } from '~/lib/translator';
import { publicGetData } from './api.server';
import { resolveLocale } from './i18n.server';

export function loadAdministrativeProvinces(request: Request): Promise<AdministrativeProvince[]> {
  return publicGetData(request, '/public/administrative-divisions/provinces', {
    schema: administrativeProvinceListSchema,
  });
}

export function loadAdministrativeWards(
  request: Request,
  provinceCode: string,
): Promise<AdministrativeWard[]> {
  return publicGetData(
    request,
    `/public/administrative-divisions/wards?provinceCode=${encodeURIComponent(provinceCode)}`,
    { schema: administrativeWardListSchema },
  );
}

/**
 * The ward resource route's body: the province combobox fetches it as the visitor
 * picks a province, so the answer is cached for a day.
 */
export async function handleAdministrativeWardsLoader(request: Request): Promise<Response> {
  const parsed = listAdministrativeWardsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    const { t } = localeTranslator(resolveLocale(request, 'vi'));
    return Response.json({ message: t('errors.invalidProvinceCode') }, { status: 400 });
  }

  const wards = await loadAdministrativeWards(request, parsed.data.provinceCode);
  return Response.json(
    { provinceCode: parsed.data.provinceCode, wards },
    { headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
