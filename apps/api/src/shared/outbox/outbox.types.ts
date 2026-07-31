export interface OutboxEventRecord {
  id: string;
  tenantId: string | null;
  eventType: string;
  payload: unknown;
  attempts: number;
  /**
   * DB-clock insert time of the emitting transaction. Delivery is at-least-once
   * and out of order (a failed row backs off while newer rows drain), so a
   * handler that writes an absolute snapshot needs a monotonic marker to reject
   * a stale redelivery — this is it. Never `Date.now()`.
   */
  createdAt: Date;
}

export type OutboxHandler = (event: OutboxEventRecord) => Promise<void>;
