import { describe, expect, it } from 'vitest';
import type { BookingStatus } from '@booking/contracts';
import type {
  BookingRecord,
  PartnerCalendarBooking,
} from '../domain/ports/booking-repository.port';
import {
  toBookingResponse,
  toCancelResponse,
  toCustomerBookingResponse,
  toPartnerBookingResponse,
  toPartnerCancelResponse,
  toReturnResponse,
} from './booking.mapper';
import { toPartnerCalendarResponse } from './partner-calendar.mapper';

const EMAIL = 'customer@example.com';
const PHONE = '0912345678';

/** Every status a booking can be in — the mask policy must hold across all of them. */
const ALL_STATUSES: BookingStatus[] = [
  'draft',
  'pending_approval',
  'pending_payment',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
  'rejected',
  'expired',
  'refunded',
];

function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: 'b1',
    tenantId: 't1',
    listingId: 'l1',
    listingTitle: 'Studio A',
    partnerId: 'p1',
    resourceId: 'r1',
    customerId: 'c1',
    customer: { id: 'c1', fullName: 'Nguyễn Văn A', phone: PHONE, email: EMAIL },
    code: 'BK-TEST',
    idempotencyKey: 'k',
    bookingMode: 'hourly',
    status: 'pending_payment',
    startUtc: new Date('2026-01-01T10:00:00Z'),
    endUtc: new Date('2026-01-01T12:00:00Z'),
    guestCount: 2,
    quantity: 1,
    totalAmount: 500_000n,
    discountAmount: 50_000n,
    finalAmount: 450_000n,
    depositAmount: 150_000n,
    paidAmount: 0n,
    securityDeposit: 0n,
    pickedUpAt: null,
    returnedAt: null,
    damageAmount: 0n,
    additionalCharges: [],
    cancellationPolicyId: null,
    cancellationPolicySnapshot: null,
    promotionId: null,
    promoCode: null,
    promotionSnapshot: null,
    commissionSnapshot: { ruleId: 'cr1', tenantRate: '1000', platformRate: 200 },
    pricingSnapshot: { currency: 'VND', subtotal: '500000' },
    affiliateId: null,
    referralCode: null,
    customerNote: null,
    partnerNote: null,
    expiresAt: null,
    createdAt: new Date('2026-01-01T09:00:00Z'),
    updatedAt: new Date('2026-01-01T09:30:00Z'),
    ...overrides,
  };
}

function calendarBooking(status: BookingStatus): PartnerCalendarBooking {
  return {
    id: 'b1',
    code: 'BK-TEST',
    status,
    listingId: 'l1',
    listingTitle: 'Studio A',
    listingTypeId: 'lt1',
    listingTypeName: 'Studio',
    resourceId: 'r1',
    bookingMode: 'hourly',
    startUtc: new Date('2026-01-01T10:00:00Z'),
    endUtc: new Date('2026-01-01T12:00:00Z'),
    guestCount: 2,
    quantity: 1,
    customer: { id: 'c1', fullName: 'Nguyễn Văn A', phone: PHONE, email: EMAIL },
    finalAmount: 450_000n,
    discountAmount: 50_000n,
    depositAmount: 150_000n,
    paidAmount: 0n,
    securityDeposit: 0n,
    pickedUpAt: null,
    returnedAt: null,
    customerNote: null,
    expiresAt: null,
    createdAt: new Date('2026-01-01T09:00:00Z'),
  };
}

/** Deep search for a value anywhere in the payload — catches leaks via any nesting. */
function serialisedContains(payload: unknown, needle: string): boolean {
  return JSON.stringify(payload).includes(needle);
}

describe('booking.mapper — tenant audience', () => {
  it('exposes the customer identity in full', () => {
    expect(toBookingResponse(booking()).customer).toEqual({
      id: 'c1',
      fullName: 'Nguyễn Văn A',
      phone: PHONE,
      email: EMAIL,
    });
  });

  it('never masks the phone, whatever the status', () => {
    for (const status of ALL_STATUSES) {
      expect(toBookingResponse(booking({ status })).customer.phone).toBe(PHONE);
    }
  });

  it('exposes the internal financial snapshots', () => {
    const res = toBookingResponse(booking());
    expect(res.commissionSnapshot).toEqual({ ruleId: 'cr1', tenantRate: '1000', platformRate: 200 });
    expect(res.pricingSnapshot).toEqual({ currency: 'VND', subtotal: '500000' });
  });

  it("exposes the partner's note and the affiliate attribution", () => {
    const res = toBookingResponse(
      booking({ partnerNote: 'Khách quen', affiliateId: 'aff-1', referralCode: 'REF123' }),
    );
    expect(res.partnerNote).toBe('Khách quen');
    expect(res.affiliateId).toBe('aff-1');
    expect(res.referralCode).toBe('REF123');
  });
});

// The storefront BFF serialises this payload straight to the customer's browser,
// so anything included here is effectively public to that customer.
describe('booking.mapper — customer audience (storefront)', () => {
  it("withholds the partner's private note about the customer", () => {
    const res = toCustomerBookingResponse(booking({ partnerNote: 'Khách khó tính' }));
    expect(res).not.toHaveProperty('partnerNote');
    expect(serialisedContains(res, 'Khách khó tính')).toBe(false);
  });

  it("withholds the tenant's commission snapshot (the take-rate)", () => {
    const res = toCustomerBookingResponse(booking());
    expect(res).not.toHaveProperty('commissionSnapshot');
    expect(serialisedContains(res, 'cr1')).toBe(false);
  });

  it('withholds the affiliate attribution', () => {
    const res = toCustomerBookingResponse(
      booking({ affiliateId: 'aff-1', referralCode: 'REF123' }),
    );
    expect(res).not.toHaveProperty('affiliateId');
    expect(res).not.toHaveProperty('referralCode');
    expect(serialisedContains(res, 'REF123')).toBe(false);
  });

  it('withholds all of the above on the cancel result too', () => {
    const res = toCancelResponse({
      booking: booking({ partnerNote: 'Khách khó tính', referralCode: 'REF123' }),
      refundAmount: 450_000n,
      refundPercent: 100,
    });
    expect(res).not.toHaveProperty('partnerNote');
    expect(res).not.toHaveProperty('commissionSnapshot');
    expect(serialisedContains(res, 'Khách khó tính')).toBe(false);
    expect(res.refundAmount).toBe('450000');
  });

  it("still gives the customer their own identity and price breakdown", () => {
    const res = toCustomerBookingResponse(booking());
    expect(res.customer.email).toBe(EMAIL);
    expect(res.customer.phone).toBe(PHONE);
    expect(res.pricingSnapshot).toEqual({ currency: 'VND', subtotal: '500000' });
  });
});

// ── The §7.3 anti-disintermediation boundary ─────────────────────────────────
// A partner must never be able to harvest a customer's contact details. These are
// security tests: they assert on the SERIALISED payload, because nothing strips
// responses at runtime — whatever the mapper returns is what leaves the API.
describe('booking.mapper — partner audience (§7.3 PII boundary)', () => {
  describe('email', () => {
    it('NEVER returns the customer email, in any status', () => {
      for (const status of ALL_STATUSES) {
        const res = toPartnerBookingResponse(booking({ status }));
        expect(res.customer).not.toHaveProperty('email');
        expect(serialisedContains(res, EMAIL)).toBe(false);
      }
    });

    it('NEVER returns the email on the calendar feed, in any status', () => {
      for (const status of ALL_STATUSES) {
        const res = toPartnerCalendarResponse(calendarBooking(status));
        expect(res.customer).not.toHaveProperty('email');
        expect(serialisedContains(res, EMAIL)).toBe(false);
      }
    });

    it('NEVER returns the email on the cancel result', () => {
      const res = toPartnerCancelResponse({
        booking: booking({ status: 'cancelled' }),
        refundAmount: 450_000n,
        refundPercent: 100,
      });
      expect(serialisedContains(res, EMAIL)).toBe(false);
    });

    it('NEVER returns the email on the inventory return settlement', () => {
      const res = toReturnResponse({
        booking: booking({ status: 'completed' }),
        lateFee: 0n,
        depositRefund: 0n,
        depositShortfall: 0n,
      });
      expect(serialisedContains(res, EMAIL)).toBe(false);
    });
  });

  // The partner sees the real phone only on a live-or-served booking; every other
  // status stays masked. Kept in sync with PHONE_REVEALED_STATUSES in the mapper.
  const REVEALED: BookingStatus[] = ['confirmed', 'completed', 'no_show'];

  describe('phone masking', () => {
    it('masks the phone on every non-revealed status', () => {
      for (const status of ALL_STATUSES.filter((s) => !REVEALED.includes(s))) {
        const res = toPartnerBookingResponse(booking({ status }));
        expect(res.customer.phone).toBe('0912•••678');
        expect(res.customer.phoneMasked).toBe(true);
        expect(serialisedContains(res, PHONE)).toBe(false);
      }
    });

    it('masks the phone on every non-revealed status of the calendar feed', () => {
      for (const status of ALL_STATUSES.filter((s) => !REVEALED.includes(s))) {
        const res = toPartnerCalendarResponse(calendarBooking(status));
        expect(res.customer.phone).toBe('0912•••678');
        expect(res.customer.phoneMasked).toBe(true);
        expect(serialisedContains(res, PHONE)).toBe(false);
      }
    });

    it('reveals the real phone on a live-or-served booking — the partner must reach the guest', () => {
      for (const status of REVEALED) {
        const res = toPartnerBookingResponse(booking({ status }));
        expect(res.customer.phone).toBe(PHONE);
        expect(res.customer.phoneMasked).toBe(false);
      }
    });

    it('reveals the real phone on the revealed-status calendar feed', () => {
      for (const status of REVEALED) {
        const res = toPartnerCalendarResponse(calendarBooking(status));
        expect(res.customer.phone).toBe(PHONE);
        expect(res.customer.phoneMasked).toBe(false);
      }
    });

    it('reports phoneMasked=false when there is no phone to mask', () => {
      const record = booking({
        customer: { id: 'c1', fullName: 'Nguyễn Văn A', phone: null, email: EMAIL },
      });
      const res = toPartnerBookingResponse(record);
      expect(res.customer.phone).toBeNull();
      expect(res.customer.phoneMasked).toBe(false);
    });
  });

  describe('internal financials', () => {
    it('withholds the commission and pricing snapshots', () => {
      const res = toPartnerBookingResponse(booking());
      expect(res).not.toHaveProperty('commissionSnapshot');
      expect(res).not.toHaveProperty('pricingSnapshot');
      expect(serialisedContains(res, 'cr1')).toBe(false);
    });

    it('withholds the affiliate attribution', () => {
      const res = toPartnerBookingResponse(
        booking({ affiliateId: 'aff-1', referralCode: 'REF123' }),
      );
      expect(res).not.toHaveProperty('affiliateId');
      expect(serialisedContains(res, 'REF123')).toBe(false);
    });
  });

  it('still gives the partner what they need to run the booking', () => {
    const res = toPartnerBookingResponse(
      booking({ customerNote: 'Cần thêm ghế', partnerNote: 'Đã gọi xác nhận' }),
    );
    expect(res.customer.fullName).toBe('Nguyễn Văn A');
    expect(res.listingTitle).toBe('Studio A');
    expect(res.customerNote).toBe('Cần thêm ghế');
    // The partner's own note is theirs to read.
    expect(res.partnerNote).toBe('Đã gọi xác nhận');
    expect(res.finalAmount).toBe('450000');
  });
});

describe('booking.mapper — jsonb coercion', () => {
  it('maps additional charges, keeping money as digit strings', () => {
    const res = toBookingResponse(
      booking({ additionalCharges: [{ type: 'late_fee', amount: '50000' }] }),
    );
    expect(res.additionalCharges).toEqual([{ type: 'late_fee', amount: '50000' }]);
  });

  it('normalises a numeric charge amount to a digit string', () => {
    const res = toBookingResponse(booking({ additionalCharges: [{ type: 'x', amount: 5000 }] }));
    expect(res.additionalCharges).toEqual([{ type: 'x', amount: '5000' }]);
  });

  it('drops malformed charge rows rather than emitting a bad amount', () => {
    const res = toBookingResponse(
      booking({
        additionalCharges: [
          { type: 'ok', amount: '100' },
          { type: 'bad', amount: 'not-a-number' },
          { amount: '200' },
          null,
        ],
      }),
    );
    expect(res.additionalCharges).toEqual([{ type: 'ok', amount: '100' }]);
  });

  it('tolerates a non-array additional_charges column', () => {
    expect(toBookingResponse(booking({ additionalCharges: null })).additionalCharges).toEqual([]);
  });

  it('maps the snapshotted cancellation tiers', () => {
    const res = toBookingResponse(
      booking({
        cancellationPolicySnapshot: [
          { hoursBefore: 48, refundPercent: 100 },
          { hoursBefore: 0, refundPercent: 0 },
        ],
      }),
    );
    expect(res.cancellationPolicySnapshot).toEqual([
      { hoursBefore: 48, refundPercent: 100 },
      { hoursBefore: 0, refundPercent: 0 },
    ]);
  });

  it('returns null tiers when the listing had no policy', () => {
    expect(toBookingResponse(booking()).cancellationPolicySnapshot).toBeNull();
  });

  it('returns a null snapshot for a non-object jsonb value', () => {
    expect(toBookingResponse(booking({ pricingSnapshot: 'garbage' })).pricingSnapshot).toBeNull();
  });
});
