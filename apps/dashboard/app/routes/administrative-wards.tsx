import { listAdministrativeWardsQuerySchema } from '@booking/contracts';
import { requireUser } from '~/lib/auth.server';
import { loadAdministrativeWards } from '~/lib/administrative-divisions.server';
import type { Route } from './+types/administrative-wards';

export async function loader({ request }: Route.LoaderArgs) {
  const parsed = listAdministrativeWardsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return Response.json({ message: 'Mã tỉnh/thành phố không hợp lệ.' }, { status: 400 });
  }
  const user = await requireUser(request);
  const wards = await loadAdministrativeWards(
    { token: user.accessToken },
    parsed.data.provinceCode,
    request.signal,
  );
  return Response.json(
    { provinceCode: parsed.data.provinceCode, wards },
    { headers: { 'Cache-Control': 'private, max-age=86400' } },
  );
}
