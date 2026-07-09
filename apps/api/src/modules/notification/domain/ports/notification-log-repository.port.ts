export const NOTIFICATION_LOG_REPOSITORY = Symbol('NOTIFICATION_LOG_REPOSITORY');

export interface NotificationLogRecord {
  tenantId: string | null;
  userId: string | null;
  channel: 'email' | 'zns' | 'in_app';
  eventType: string;
  recipient: string;
  status: 'pending' | 'sent' | 'failed';
  /** Deterministic key stored in `payload.dedupeKey` — the idempotency guard (§17 DoD). */
  dedupeKey: string;
  error?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * `notification_logs` access. Writes go through the BYPASSRLS admin pool because
 * `tenant_id` can be null (platform-wide rows) and the RLS policy has no WITH CHECK
 * for the app_user role — same shape as outbox_events / audit_logs.
 */
export interface INotificationLogRepository {
  /** True once a `sent` row exists for this dedupe key (guards outbox retries). */
  alreadySent(dedupeKey: string): Promise<boolean>;
  record(entry: NotificationLogRecord): Promise<void>;
}
