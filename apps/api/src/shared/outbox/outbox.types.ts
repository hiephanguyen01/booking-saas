export interface OutboxEventRecord {
  id: string;
  tenantId: string | null;
  eventType: string;
  payload: unknown;
  attempts: number;
}

export type OutboxHandler = (event: OutboxEventRecord) => Promise<void>;
