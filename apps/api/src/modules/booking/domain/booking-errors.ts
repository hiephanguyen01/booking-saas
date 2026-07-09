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
