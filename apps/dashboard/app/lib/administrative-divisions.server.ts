import {
  administrativeProvinceListSchema,
  administrativeWardListSchema,
  type AdministrativeProvince,
  type AdministrativeWard,
} from '@booking/contracts';
import { apiGet, unwrapApiResult, type ApiAuth } from './api.server';
import { apiPaths } from '~/constants/api-paths';

export async function loadAdministrativeProvinces(
  auth: ApiAuth,
  signal?: AbortSignal,
): Promise<AdministrativeProvince[]> {
  const result = await apiGet<AdministrativeProvince[]>(
    apiPaths.publicData.provinces,
    auth,
    { signal, schema: administrativeProvinceListSchema },
  );
  return unwrapApiResult(result, 'Không thể tải danh sách tỉnh/thành phố.');
}

export async function loadAdministrativeWards(
  auth: ApiAuth,
  provinceCode: string,
  signal?: AbortSignal,
): Promise<AdministrativeWard[]> {
  const result = await apiGet<AdministrativeWard[]>(
    `/public/administrative-divisions/wards?provinceCode=${encodeURIComponent(provinceCode)}`,
    auth,
    { signal, schema: administrativeWardListSchema },
  );
  return unwrapApiResult(result, 'Không thể tải danh sách phường/xã.');
}
