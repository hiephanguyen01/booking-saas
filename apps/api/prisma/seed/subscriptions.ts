import { Prisma } from '@prisma/client';
import type { SeedScope } from './scope';
import { prisma } from './client';

export const BOOKING_STAD_TRIAL_FIXTURE_ID = '0198cce1-6f0c-7000-8000-000000000005';
const BOOKING_STAD_TRIAL_FIXTURE_NOTE = 'Trial expiring soon';

type BookingStadTrialInput = {
  tenantId: string;
  planId: string;
  scope: SeedScope;
  startsAt: Date;
  expiresAt: Date;
};

function isLegacyBookingStadTrialFixture(subscription: {
  status: string;
  note: string | null;
}): boolean {
  return subscription.status === 'trial' && subscription.note === BOOKING_STAD_TRIAL_FIXTURE_NOTE;
}

/**
 * The trial row is seed-owned only after it has the deterministic fixture id.
 * A prior arbitrary-id row is adopted solely when it is the only subscription
 * and still carries the exact legacy fixture marker; controller history wins.
 */
export async function reconcileBookingStadTrial(input: BookingStadTrialInput): Promise<void> {
  const trial = {
    planId: input.planId,
    status: 'trial' as const,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    note: BOOKING_STAD_TRIAL_FIXTURE_NOTE,
  };

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`seed-booking-stad-trial:${input.tenantId}`}))`,
    );

    const [subscriptions, fixtureById] = await Promise.all([
      tx.tenantSubscription.findMany({ where: { tenantId: input.tenantId } }),
      tx.tenantSubscription.findUnique({ where: { id: BOOKING_STAD_TRIAL_FIXTURE_ID } }),
    ]);
    if (fixtureById && fixtureById.tenantId !== input.tenantId) {
      throw new Error(
        `BookingStad trial fixture id ${BOOKING_STAD_TRIAL_FIXTURE_ID} belongs to another tenant.`,
      );
    }

    if (input.scope === 'tenants') {
      if (subscriptions.length === 0) {
        await tx.tenantSubscription.create({
          data: { id: BOOKING_STAD_TRIAL_FIXTURE_ID, tenantId: input.tenantId, ...trial },
        });
      }
      return;
    }

    const ownedTrial = subscriptions.find(
      (subscription) => subscription.id === BOOKING_STAD_TRIAL_FIXTURE_ID,
    );
    const unrelatedSubscriptions = subscriptions.filter(
      (subscription) => subscription.id !== BOOKING_STAD_TRIAL_FIXTURE_ID,
    );
    if (ownedTrial) {
      if (unrelatedSubscriptions.length === 0) {
        await tx.tenantSubscription.update({ where: { id: ownedTrial.id }, data: trial });
      }
      return;
    }

    const soleSubscription = subscriptions.length === 1 ? subscriptions[0] : null;
    if (soleSubscription && isLegacyBookingStadTrialFixture(soleSubscription)) {
      await tx.tenantSubscription.update({
        where: { id: soleSubscription.id },
        data: { id: BOOKING_STAD_TRIAL_FIXTURE_ID, ...trial },
      });
      return;
    }

    if (subscriptions.length === 0) {
      await tx.tenantSubscription.create({
        data: { id: BOOKING_STAD_TRIAL_FIXTURE_ID, tenantId: input.tenantId, ...trial },
      });
    }
  });
}
