import type { NotificationArea, NotificationTargetType } from '@booking/contracts';

export type { NotificationArea, NotificationTargetType };

/** One inbox row to be written. Framework-free — no Nest, no Prisma. */
export interface InboxRow {
  tenantId: string;
  userId: string;
  area: NotificationArea;
  eventType: string;
  title: string;
  body: string | null;
  targetType: NotificationTargetType;
  targetId: string | null;
  dedupeKey: string;
}
