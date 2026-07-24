import type { NotificationLogEntry } from '../entities/notification-delivery.entity';

export const NOTIFICATION_LOG_REPOSITORY = Symbol('NOTIFICATION_LOG_REPOSITORY');

/**
 * `notification_logs` access. Writes go through the BYPASSRLS admin pool because
 * `tenant_id` can be null (platform-wide rows) and the RLS policy has no WITH CHECK
 * for the app_user role — same shape as outbox_events / audit_logs. This port takes
 * NO `PrismaTx` on purpose: a delivery log must not join a business transaction.
 */
export interface INotificationLogRepository {
  /** True once a `sent` row exists for this dedupe key (guards outbox retries). */
  alreadySent(dedupeKey: string): Promise<boolean>;
  record(entry: NotificationLogEntry): Promise<void>;
}
