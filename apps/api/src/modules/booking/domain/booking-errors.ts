/** The slot was taken by another booking (Postgres exclusion violation, §10). */
export class SlotTakenError extends Error {
  constructor() {
    super('The selected slot is no longer available');
    this.name = 'SlotTakenError';
  }
}

/** The slot is temporarily held by another customer (Redis hold, §10 Layer 1). */
export class SlotHeldError extends Error {
  constructor() {
    super('The selected slot is currently held by another customer');
    this.name = 'SlotHeldError';
  }
}

/**
 * A concurrent request with the same idempotency key won the insert race (the
 * `(tenant_id, idempotency_key)` unique index fired). The caller should re-read
 * the winning booking and return it — the request is idempotent, not a failure.
 */
export class IdempotencyConflictError extends Error {
  constructor() {
    super('A booking with this idempotency key already exists');
    this.name = 'IdempotencyConflictError';
  }
}
