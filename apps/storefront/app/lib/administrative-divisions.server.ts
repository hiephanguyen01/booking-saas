import {
  administrativeProvinceListSchema,
  administrativeWardListSchema,
  type AdministrativeProvince,
  type AdministrativeWard,
} from '@booking/contracts';
import { requestPublicJson } from './public-api.server';

export async function loadAdministrativeProvinces(
  request: Request,
): Promise<AdministrativeProvince[]> {
  const payload = await requestPublicJson<unknown>(
    request,
    '/public/administrative-divisions/provinces',
  );
  const parsed = administrativeProvinceListSchema.safeParse(payload);
  if (!parsed.success)
    throw new Response('Invalid administrative province response', { status: 502 });
  return parsed.data;
}

export async function loadAdministrativeWards(
  request: Request,
  provinceCode: string,
): Promise<AdministrativeWard[]> {
  const payload = await requestPublicJson<unknown>(
    request,
    `/public/administrative-divisions/wards?provinceCode=${encodeURIComponent(provinceCode)}`,
  );
  const parsed = administrativeWardListSchema.safeParse(payload);
  if (!parsed.success) throw new Response('Invalid administrative ward response', { status: 502 });
  return parsed.data;
}
