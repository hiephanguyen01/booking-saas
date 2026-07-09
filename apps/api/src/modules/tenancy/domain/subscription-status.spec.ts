import { describe, expect, it } from 'vitest';
import { evaluateSubscription, GRACE_PERIOD_DAYS } from './subscription-status';

const day = 86_400_000;
const now = new Date('2026-07-08T00:00:00Z');

describe('evaluateSubscription', () => {
  it('an active subscription before expiry is fully live', () => {
    const e = evaluateSubscription(
      { status: 'active', startsAt: new Date(now.getTime() - 30 * day), expiresAt: new Date(now.getTime() + 10 * day) },
      now,
    );
    expect(e).toMatchObject({
      phase: 'active',
      storefrontLive: true,
      dashboardWritable: true,
      newBookingsAllowed: true,
    });
    expect(e.daysUntilExpiry).toBe(10);
  });

  it('a trial is treated like active', () => {
    const e = evaluateSubscription(
      { status: 'trial', startsAt: now, expiresAt: new Date(now.getTime() + 5 * day) },
      now,
    );
    expect(e.phase).toBe('active');
    expect(e.storefrontLive).toBe(true);
  });

  it('just past expiry → grace: suspended storefront, read-only dashboard, no new bookings', () => {
    const e = evaluateSubscription(
      { status: 'active', startsAt: new Date(now.getTime() - 60 * day), expiresAt: new Date(now.getTime() - 5 * day) },
      now,
    );
    expect(e).toMatchObject({
      phase: 'grace',
      storefrontLive: false,
      dashboardWritable: false,
      newBookingsAllowed: false,
    });
  });

  it('past the grace window → fully expired', () => {
    const e = evaluateSubscription(
      {
        status: 'active',
        startsAt: new Date(now.getTime() - 400 * day),
        expiresAt: new Date(now.getTime() - (GRACE_PERIOD_DAYS + 5) * day),
      },
      now,
    );
    expect(e.phase).toBe('expired');
    expect(e.storefrontLive).toBe(false);
  });

  it('a past_due subscription stays live until it actually expires (dunning, not suspension)', () => {
    const e = evaluateSubscription(
      { status: 'past_due', startsAt: new Date(now.getTime() - 30 * day), expiresAt: new Date(now.getTime() + 3 * day) },
      now,
    );
    expect(e).toMatchObject({
      phase: 'active',
      storefrontLive: true,
      dashboardWritable: true,
      newBookingsAllowed: true,
    });
  });

  it('a past_due subscription past its expiry is suspended like any lapsed one', () => {
    const e = evaluateSubscription(
      { status: 'past_due', startsAt: new Date(now.getTime() - 60 * day), expiresAt: new Date(now.getTime() - 2 * day) },
      now,
    );
    expect(e.phase).toBe('grace');
    expect(e.storefrontLive).toBe(false);
  });

  it('a cancelled subscription is never live even before its expiry date', () => {
    const e = evaluateSubscription(
      { status: 'cancelled', startsAt: new Date(now.getTime() - 10 * day), expiresAt: new Date(now.getTime() + 10 * day) },
      now,
    );
    expect(e.storefrontLive).toBe(false);
    expect(e.dashboardWritable).toBe(false);
  });

  it('no subscription at all is treated as expired', () => {
    expect(evaluateSubscription(null, now).phase).toBe('expired');
  });
});
