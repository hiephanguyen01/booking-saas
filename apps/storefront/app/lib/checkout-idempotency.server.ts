import { createHash, randomUUID } from 'node:crypto';

const CHECKOUT_ATTEMPT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CheckoutIdempotencyInput {
  tenantId: string;
  attemptId: string;
}

export function createCheckoutAttemptId(): string {
  return randomUUID();
}

export function parseCheckoutAttemptId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const attemptId = value.trim();
  return CHECKOUT_ATTEMPT_RE.test(attemptId) ? attemptId.toLowerCase() : null;
}

export function buildCheckoutIdempotencyKey(input: CheckoutIdempotencyInput): string {
  const canonical = `${input.tenantId}:${input.attemptId}`;
  return `checkout:${createHash('sha256').update(canonical).digest('hex')}`;
}
