import { describe, expect, it } from 'vitest';
import { planForEvent } from './notification-plan';

describe('planForEvent', () => {
  it('routes a pay-now booking to the customer, an approval-gated one to the partner', () => {
    expect(planForEvent('booking.created', { status: 'pending_payment' })).toEqual([
      { audience: 'customer', templateId: 'booking_pending_payment_customer' },
    ]);
    expect(planForEvent('booking.created', { status: 'pending_approval' })).toEqual([
      { audience: 'partner', templateId: 'booking_pending_approval_partner' },
    ]);
  });

  it('notifies both customer and partner on confirm + cancel', () => {
    expect(planForEvent('booking.confirmed', {}).map((p) => p.audience)).toEqual(['customer', 'partner']);
    expect(planForEvent('booking.cancelled', {}).map((p) => p.audience)).toEqual(['customer', 'partner']);
  });

  it('maps the remaining booking + listing + partner events', () => {
    expect(planForEvent('booking.completed', {})[0]?.templateId).toBe('booking_completed_customer');
    expect(planForEvent('booking.no_show', {})[0]?.templateId).toBe('booking_no_show_customer');
    expect(planForEvent('booking.rejected', {})[0]?.templateId).toBe('booking_rejected_customer');
    expect(planForEvent('listing.published', {})[0]?.templateId).toBe('listing_published_partner');
    expect(planForEvent('listing.hidden', {})[0]?.templateId).toBe('listing_hidden_partner');
    expect(planForEvent('partner.approved', {})[0]?.templateId).toBe('partner_approved');
  });

  it('returns no plan for an event without a notification', () => {
    expect(planForEvent('booking.picked_up', {})).toEqual([]);
    expect(planForEvent('listing.created', {})).toEqual([]);
  });
});
