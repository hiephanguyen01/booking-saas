import type { NotificationArea } from '@booking/contracts';

/**
 * Which bell the current screen shows. A user can be tenant staff AND a partner
 * member in the same tenant (a house partner is exactly that), so the bell is
 * scoped by the area you are standing in — otherwise `/partner` would show
 * "đơn đăng ký đối tác mới chờ duyệt".
 *
 * `/admin` returns null: no event addresses the platform console yet, so the
 * shell renders no bell there.
 */
export function areaForPathname(pathname: string): NotificationArea | null {
  if (pathname.startsWith('/tenant')) return 'tenant';
  if (pathname.startsWith('/partner')) return 'partner';
  if (pathname.startsWith('/affiliate')) return 'affiliate';
  return null;
}
