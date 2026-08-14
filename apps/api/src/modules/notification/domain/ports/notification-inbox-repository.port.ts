import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type { InboxRow, NotificationArea } from '../notification-area';

export const NOTIFICATION_INBOX_REPOSITORY = Symbol('NOTIFICATION_INBOX_REPOSITORY');

/** A persisted row, as read back for the feed. */
export interface InboxRowRecord {
  id: string;
  area: NotificationArea;
  eventType: string;
  title: string;
  body: string | null;
  targetType: string;
  targetId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface InboxFeedQuery {
  userId: string;
  area: NotificationArea;
  page: number;
  pageSize: number;
}

/**
 * ⚠️ SECURITY INVARIANT — RLS on `notifications` isolates TENANTS, not users.
 * Inside one tenant an app_user session can read every row. Every method here
 * therefore takes a `userId` and MUST filter on it, and `markRead` MUST express
 * ownership as an UPDATE predicate rather than reading the row and checking it
 * afterwards. Removing a `user_id` bound turns a tenant-mate into an attacker.
 */
export interface INotificationInboxRepository {
  /** Idempotent bulk insert — ON CONFLICT (user_id, dedupe_key) DO NOTHING. */
  insertMany(tx: PrismaTx, rows: InboxRow[]): Promise<void>;
  list(tx: PrismaTx, query: InboxFeedQuery): Promise<RepoPage<InboxRowRecord>>;
  countUnread(tx: PrismaTx, userId: string, area: NotificationArea): Promise<number>;
  /** Returns false when the row is not this user's — the caller 404s. */
  markRead(tx: PrismaTx, userId: string, id: string, now: Date): Promise<boolean>;
  markAllRead(tx: PrismaTx, userId: string, area: NotificationArea, now: Date): Promise<void>;
  /** Retention sweep — cross-tenant, runs on the admin pool, not this tx. */
  deleteOlderThan(cutoff: Date): Promise<number>;
}
