import { redirect } from 'react-router';
import type { Route } from './+types/home';
import { defaultAreaFor, requireSessionInfo } from '~/lib/auth.server';

/**
 * Dashboard entrypoint: send the user to their highest-privilege area. A logged-in
 * user with no area memberships (e.g. a plain customer) sees the no-access notice.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { info } = await requireSessionInfo(request);
  const area = defaultAreaFor(info);
  if (area !== '/') throw redirect(area);
  return { fullName: info.user.fullName };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-md space-y-2 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Xin chào, {loaderData.fullName}</h1>
      <p className="text-muted-foreground">
        Tài khoản của bạn chưa được gán vào khu vực quản trị nào. Vui lòng liên hệ quản trị viên để
        được cấp quyền.
      </p>
    </div>
  );
}
