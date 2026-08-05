import { data } from 'react-router';
import {
  geocodeAdministrativeAddressInputSchema,
  type GeocodeAdministrativeAddressResponse,
} from '@booking/contracts';
import type { Route } from './+types/geocode';
import { apiPaths } from '~/constants/api-paths';
import type { GeocodeActionResult } from '~/features/partner/lib/geocoding';
import { requirePartner } from '~/features/partner/server/partner.server';
import { apiPost } from '~/lib/api.server';

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request, 'partner.listings.write');
  const parsed = geocodeAdministrativeAddressInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data<GeocodeActionResult>(
      {
        query: null,
        candidates: [],
        attribution: null,
        error: 'Vui lòng chọn tỉnh, phường/xã và nhập địa chỉ cụ thể.',
      },
      { status: 400 },
    );
  }

  const result = await apiPost<GeocodeAdministrativeAddressResponse>(
    apiPaths.partner.geocode,
    parsed.data,
    auth,
  );
  if (!result.ok || !result.data) {
    const error =
      result.status === 429
        ? 'Dịch vụ định vị đang bận. Vui lòng thử lại sau vài giây.'
        : result.status >= 500
          ? 'Dịch vụ định vị tạm thời không khả dụng. Bạn vẫn có thể dùng GPS hoặc nhập tọa độ.'
          : (result.error ?? 'Không tìm được tọa độ lúc này. Vui lòng thử lại.');
    return data<GeocodeActionResult>(
      {
        query: parsed.data,
        candidates: [],
        attribution: null,
        error,
      },
      { status: result.status || 502 },
    );
  }

  return data<GeocodeActionResult>({
    query: parsed.data,
    candidates: result.data.candidates,
    attribution: result.data.attribution,
    error: null,
  });
}
