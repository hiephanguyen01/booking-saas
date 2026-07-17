import {
  administrativeProvinceListSchema,
  administrativeWardListSchema,
  type AdministrativeProvince,
  type AdministrativeWard,
} from '@booking/contracts';
import { publicGetData } from './api.server';

export function loadAdministrativeProvinces(
  request: Request,
): Promise<AdministrativeProvince[]> {
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
