import { createHash } from 'node:crypto';

export interface CheckoutIdempotencyInput {
  tenantId: string;
  listingId: string;
  mode: string;
  start: string;
  end: string;
  quantity: number;
  packageId: string | null;
  promoCode: string | null;
  email: string;
  phone: string;
}

export function buildCheckoutIdempotencyKey(input: CheckoutIdempotencyInput): string {
  const canonical = JSON.stringify({
    tenantId: input.tenantId,
    listingId: input.listingId,
    mode: input.mode,
    start: input.start,
    end: input.end,
    quantity: input.quantity,
    packageId: input.packageId,
    promoCode: input.promoCode?.trim().toUpperCase() || null,
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
  });

  return `checkout:${createHash('sha256').update(canonical).digest('hex')}`;
}
