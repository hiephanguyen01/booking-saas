import type { NotificationResponse, NotificationTargetType } from '@booking/contracts';
import type { InboxRowRecord } from '../domain/ports/notification-inbox-repository.port';

export function toNotificationResponse(row: InboxRowRecord): NotificationResponse {
  return {
    id: row.id,
    area: row.area,
    eventType: row.eventType,
    title: row.title,
    body: row.body,
    targetType: row.targetType as NotificationTargetType,
    targetId: row.targetId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
