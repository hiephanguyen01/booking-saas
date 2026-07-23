import { vnd } from '../../../shared/money/money';
import type { PromotionUpdateInput } from '../domain/entities/promotion.entity';

/**
 * The wire→domain conversion shared by the tenant and partner update use-cases.
 * Both contract inputs carry the same shared optional fields; keeping ONE converter is
 * what stops the tri-state contract (`undefined` keep / `null` clear) from silently
 * drifting between the two paths. Presence is preserved key-by-key: a key absent
 * here means "leave the stored value alone".
 */
export function toPromotionUpdateInput(input: {
  name?: string;
  discountType?: 'percent' | 'fixed';
  discountValue?: string;
  maxDiscount?: string | null;
  minOrderAmount?: string | null;
  firstBookingOnly?: boolean;
  usageLimitTotal?: number | null;
  usageLimitPerCustomer?: number | null;
  timeWindows?: PromotionUpdateInput['timeWindows'];
  startsAt?: string | null;
  endsAt?: string | null;
  status?: 'draft' | 'active' | 'paused';
}): PromotionUpdateInput {
  return {
    name: input.name,
    discountType: input.discountType,
    discountValue: input.discountValue !== undefined ? vnd(input.discountValue) : undefined,
    maxDiscount:
      input.maxDiscount !== undefined ? (input.maxDiscount === null ? null : vnd(input.maxDiscount)) : undefined,
    minOrderAmount:
      input.minOrderAmount !== undefined
        ? input.minOrderAmount === null
          ? null
          : vnd(input.minOrderAmount)
        : undefined,
    firstBookingOnly: input.firstBookingOnly,
    usageLimitTotal: input.usageLimitTotal,
    usageLimitPerCustomer: input.usageLimitPerCustomer,
    timeWindows: input.timeWindows,
    startsAt:
      input.startsAt !== undefined ? (input.startsAt === null ? null : new Date(input.startsAt)) : undefined,
    endsAt: input.endsAt !== undefined ? (input.endsAt === null ? null : new Date(input.endsAt)) : undefined,
    status: input.status,
  };
}
