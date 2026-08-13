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

/**
 * Event types whose payload embeds a bearer secret (a token, password, or
 * client secret — something that alone grants access, not merely PII). The
 * relay (`outbox-relay.worker.ts`) redacts the payload of these event types
 * once delivery succeeds, so `outbox_events` — which is never pruned — does
 * not keep the secret readable for the lifetime of the row. Register a new
 * event type here the moment its payload starts carrying one.
 */
export const SECRET_PAYLOAD_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  'tenant.member_invited', // carries the clear invitation token (ADR 0001 hashes only the DB copy)
]);
