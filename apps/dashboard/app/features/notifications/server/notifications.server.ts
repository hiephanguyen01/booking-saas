import type { NotificationArea, NotificationListResponse, UnreadCountResponse } from '@booking/contracts';
import { apiGet, apiPost, type ApiAuth } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';

export async function loadUnreadCount(
  auth: ApiAuth,
  area: NotificationArea,
  signal?: AbortSignal,
): Promise<number> {
  const result = await apiGet<UnreadCountResponse>(apiPaths.notifications.unreadCount, auth, {
    query: { area },
    signal,
  });
  // The bell must never break the shell: a failed poll shows the last known
  // state rather than an error page.
  return result.ok && result.data ? result.data.count : 0;
}

export async function loadNotifications(
  auth: ApiAuth,
  area: NotificationArea,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<NotificationListResponse> {
  const result = await apiGet<NotificationListResponse>(apiPaths.notifications.list, auth, {
    query: { area, page, pageSize },
    signal,
  });
  return result.ok && result.data ? result.data : { items: [], page, pageSize, total: 0 };
}

export async function markNotificationRead(auth: ApiAuth, id: string): Promise<void> {
  await apiPost(apiPaths.notifications.read(id), {}, auth);
}

export async function markAllNotificationsRead(
  auth: ApiAuth,
  area: NotificationArea,
): Promise<void> {
  await apiPost(apiPaths.notifications.readAll, { area }, auth);
}
