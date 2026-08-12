import { redirect } from 'react-router';
import type { Route } from './+types/home';
import { requireSessionInfo } from '~/lib/auth.server';
import { getCurrentDashboardHost } from '~/lib/request-auth.server';
import { defaultDashboardPath } from '~/lib/workspace';

/**
 * Dashboard entrypoint: send the user to their highest-privilege area for the
 * current host. On the platform host that is `/admin` (platform scope) or the
 * `/workspaces` directory (everyone else); on a tenant host, their tenant or
 * partner area. A logged-in user with no area membership anywhere sees the
 * no-access notice below.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { info } = await requireSessionInfo(request);
  const area = defaultDashboardPath(info, getCurrentDashboardHost());
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
