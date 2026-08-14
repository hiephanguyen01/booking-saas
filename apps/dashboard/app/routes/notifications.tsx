import { notificationAreaSchema } from '@booking/contracts';
import { requireUser } from '~/lib/auth.server';
import { getCurrentDashboardHost } from '~/lib/request-auth.server';
import {
  loadNotifications,
  loadUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '~/features/notifications/server/notifications.server';
import type { Route } from './+types/notifications';

const POPOVER_PAGE_SIZE = 10;

/**
 * The bell's data, polled every 60s by `NotificationBell`.
 *
 * A resource route rather than the root loader: the root loader runs on every
 * navigation and must stay cheap, and a poll needs its own cadence. The request
 * still goes browser -> RR server -> API, so the httpOnly session cookie is
 * never exposed and `@booking/api-client` stays server-side.
 *
 * Deliberately does NOT use `requireTenant`: a partner-only or affiliate-only
 * user holds no tenant-scope membership and would be 403'd by it, yet they have
 * a bell.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const host = getCurrentDashboardHost();
  const url = new URL(request.url);
  const area = notificationAreaSchema.safeParse(url.searchParams.get('area'));
  if (host.kind !== 'tenant' || !area.success) {
    return Response.json({ count: 0, items: [] });
  }
  const auth = { token: user.accessToken, tenantId: host.tenant.id };
  const [count, page] = await Promise.all([
    loadUnreadCount(auth, area.data, request.signal),
    loadNotifications(auth, area.data, 1, POPOVER_PAGE_SIZE, request.signal),
  ]);
  return Response.json({ count, items: page.items });
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const host = getCurrentDashboardHost();
  if (host.kind !== 'tenant') return Response.json({ ok: false }, { status: 404 });
  const auth = { token: user.accessToken, tenantId: host.tenant.id };
  const form = await request.formData();
  const intent = form.get('intent');
  // Reflects whether the mutation actually landed — a stale-membership 403 or a
  // backend 500 must not be reported as success just because the request was
  // well-formed. Stays false for an unrecognised/malformed intent too, since no
  // mutation ran.
  let ok = false;
  if (intent === 'read-all') {
    const area = notificationAreaSchema.safeParse(form.get('area'));
    if (area.success) ok = await markAllNotificationsRead(auth, area.data);
  } else if (intent === 'read') {
    const id = form.get('id');
    if (typeof id === 'string' && id) ok = await markNotificationRead(auth, id);
  }
  return Response.json({ ok });
}
