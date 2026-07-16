import { describe, expect, it } from 'vitest';
import {
  createPromotionInputSchema,
  updatePartnerPromotionInputSchema,
  updatePromotionInputSchema,
} from './promotion';

const BASE = {
  name: 'Cuối tuần',
  code: 'WEEKEND20',
  discountType: 'percent' as const,
  discountValue: '20',
};

/**
 * The absent-vs-null distinction is the contract half of the never-clearable-field
 * bug: if these fields were plain `.optional()`, a cleared field would arrive as
 * `undefined` and the update use-case's `!== undefined` guard would skip it.
 */
describe('updatePromotionInputSchema — clearing an optional condition (§12.2)', () => {
  const CLEARABLE = [
    'maxDiscount',
    'minOrderAmount',
    'usageLimitTotal',
    'usageLimitPerCustomer',
    'timeWindows',
    'startsAt',
    'endsAt',
  ] as const;

  it.each(CLEARABLE)('accepts an explicit null for %s (clear)', (field) => {
    const parsed = updatePromotionInputSchema.safeParse({ [field]: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // The key must survive parsing — a stripped key is indistinguishable from "leave alone".
      expect(field in parsed.data).toBe(true);
      expect(parsed.data[field]).toBeNull();
    }
  });

  it.each(CLEARABLE)('omits %s entirely when not sent (leave alone)', (field) => {
    const parsed = updatePromotionInputSchema.safeParse({ name: 'Đổi tên' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data[field]).toBeUndefined();
  });

  it('still rejects a non-null junk value', () => {
    expect(updatePromotionInputSchema.safeParse({ maxDiscount: '12.5' }).success).toBe(false);
    expect(updatePromotionInputSchema.safeParse({ usageLimitTotal: 0 }).success).toBe(false);
    expect(updatePromotionInputSchema.safeParse({ startsAt: 'không phải ngày' }).success).toBe(false);
  });

  it('accepts null on the partner update schema too', () => {
    const parsed = updatePartnerPromotionInputSchema.safeParse({ maxDiscount: null, timeWindows: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.maxDiscount).toBeNull();
      expect(parsed.data.timeWindows).toBeNull();
    }
  });
});

describe('createPromotionInputSchema — null means "no condition"', () => {
  it('accepts null for every clearable condition', () => {
    const parsed = createPromotionInputSchema.safeParse({
      ...BASE,
      maxDiscount: null,
      minOrderAmount: null,
      usageLimitTotal: null,
      usageLimitPerCustomer: null,
      timeWindows: null,
      startsAt: null,
      endsAt: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a time window whose end is not after its start', () => {
    const parsed = createPromotionInputSchema.safeParse({
      ...BASE,
      timeWindows: [{ days: [6], from: '22:00', to: '18:00' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('requires appliesToId for a scoped promotion', () => {
    expect(createPromotionInputSchema.safeParse({ ...BASE, appliesTo: 'listing' }).success).toBe(false);
  });

  it('rejects a partner-funded promotion on a scope that spans partners', () => {
    expect(
      createPromotionInputSchema.safeParse({ ...BASE, fundedBy: 'partner', appliesTo: 'all' }).success,
    ).toBe(false);
  });
});
