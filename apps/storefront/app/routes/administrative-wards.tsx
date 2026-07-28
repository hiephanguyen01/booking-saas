import { listAdministrativeWardsQuerySchema } from '@booking/contracts';
import { loadAdministrativeWards } from '~/lib/server/administrative-divisions.server';
import type { Route } from './+types/administrative-wards';

export async function loader({ request }: Route.LoaderArgs) {
  const parsed = listAdministrativeWardsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return Response.json({ message: 'Mã tỉnh/thành phố không hợp lệ.' }, { status: 400 });
  }
  const wards = await loadAdministrativeWards(request, parsed.data.provinceCode);
  return Response.json(
    { provinceCode: parsed.data.provinceCode, wards },
    { headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
