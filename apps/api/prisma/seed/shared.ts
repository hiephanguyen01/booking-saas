import type { Prisma } from '@prisma/client';
import { percentOfBps } from '../../src/shared/money/money';
import { addMinutes } from '../../src/shared/time/time';
import { prisma } from './client';

/**
 * Cross-cutting seed helpers: idempotency wrappers, role assignment, and the
 * booking fixture builder. Kept out of the tenant modules so production (which
 * seeds settings only) never pulls in booking-fixture code.
 */

export async function ensure<T>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> {
  return (await find()) ?? (await create());
}

export type SeedBookingStatus =
  'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export type SeedBookingHistoryStep = {
  fromStatus: SeedBookingStatus | 'draft' | null;
  toStatus: SeedBookingStatus | 'draft';
  reason: string;
  createdAt: Date;
};

export const bookingHistory = (
  createdAt: Date,
  startAt: Date,
  endAt: Date,
  finalStatus: SeedBookingStatus,
): SeedBookingHistoryStep[] => {
  const pendingPaymentAt = addMinutes(createdAt, 5);
  const confirmedAt = addMinutes(createdAt, 10);
  if (
    pendingPaymentAt >= startAt ||
    (finalStatus !== 'pending_payment' && confirmedAt >= startAt)
  ) {
    throw new Error(
      `Seed booking ${finalStatus} lifecycle must complete before its service starts`,
    );
  }

  const steps: SeedBookingHistoryStep[] = [
    { fromStatus: null, toStatus: 'draft', reason: 'seed booking created', createdAt },
  ];
  steps.push({
    fromStatus: 'draft',
    toStatus: 'pending_payment',
    reason: 'seed booking awaiting payment',
    createdAt: pendingPaymentAt,
  });
  if (finalStatus === 'pending_payment') return steps;
  steps.push({
    fromStatus: 'pending_payment',
    toStatus: 'confirmed',
    reason: 'seed payment confirmed',
    createdAt: confirmedAt,
  });
  if (finalStatus === 'confirmed') return steps;

  const terminalAt =
    finalStatus === 'completed' || finalStatus === 'no_show'
      ? addMinutes(endAt, 5)
      : addMinutes(createdAt, 15);
  if (terminalAt <= confirmedAt || (finalStatus === 'cancelled' && terminalAt >= startAt)) {
    throw new Error(
      `Seed booking ${finalStatus} terminal transition is out of chronological order`,
    );
  }
  steps.push({
    fromStatus: 'confirmed',
    toStatus: finalStatus,
    reason: `seed booking ${finalStatus}`,
    createdAt: terminalAt,
  });
  return steps;
};

export type SeedBookingInput = {
  tenantId: string;
  listingId: string;
  partnerId: string;
  resourceId: string;
  customerId: string;
  cancellationPolicyId: string;
  code: string;
  idempotencyKey: string;
  status: SeedBookingStatus;
  finalAmount: bigint;
  paidAmount: bigint;
  refundDueAmount?: bigint;
  refundPercent?: number;
  expiresAt?: Date;
  customerNote: string;
  createdAt: Date;
  startAt: Date;
  endAt: Date;
  history: SeedBookingHistoryStep[];
};

/**
 * Seeds one hourly booking with deterministic monetary and status-history
 * snapshots. `timeslot`/`blocked_period` are Prisma
 * `Unsupported("tstzrange")`, so they are written via parameterized raw SQL.
 * Idempotent on `(tenantId, idempotencyKey)`.
 */
export async function seedBooking(input: SeedBookingInput) {
  const amount = input.finalAmount;
  const durationMs = input.endAt.getTime() - input.startAt.getTime();
  const durationHours = durationMs / (60 * 60 * 1000);
  if (!Number.isInteger(durationHours) || durationHours <= 0) {
    throw new Error(`Seed booking ${input.code} must span a positive whole number of hours`);
  }
  const unitPrice = amount / BigInt(durationHours);
  if (unitPrice * BigInt(durationHours) !== amount) {
    throw new Error(`Seed booking ${input.code} amount must divide evenly across its hourly slot`);
  }
  const depositAmount = percentOfBps(amount, 5_000);
  const bookingData = {
    listingId: input.listingId,
    partnerId: input.partnerId,
    resourceId: input.resourceId,
    customerId: input.customerId,
    cancellationPolicyId: input.cancellationPolicyId,
    bookingMode: 'hourly' as const,
    totalAmount: amount,
    finalAmount: amount,
    depositAmount,
    paidAmount: input.paidAmount,
    refundDueAmount: input.refundDueAmount ?? null,
    refundPercent: input.refundPercent ?? null,
    expiresAt: input.expiresAt ?? null,
    customerNote: input.customerNote,
    cancellationPolicySnapshot: [
      { hoursBefore: 168, refundPercent: 100 },
      { hoursBefore: 48, refundPercent: 50 },
      { hoursBefore: 0, refundPercent: 0 },
    ],
    pricingSnapshot: {
      currency: 'VND',
      mode: 'hourly',
      subtotal: amount.toString(),
      regularSubtotal: amount.toString(),
      savingsAmount: '0',
      depositAmount: depositAmount.toString(),
      securityDeposit: '0',
      lineItems: [
        {
          label: 'Thuê Studio A — Hàn Quốc',
          quantity: durationHours,
          unitPrice: unitPrice.toString(),
          regularUnitPrice: unitPrice.toString(),
          amount: amount.toString(),
          regularAmount: amount.toString(),
        },
      ],
    },
    createdAt: input.createdAt,
  };

  return prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUniqueOrThrow({
      where: { id: input.listingId },
      select: { bufferBefore: true, bufferAfter: true },
    });
    const blockedStartAt = addMinutes(input.startAt, -listing.bufferBefore);
    const blockedEndAt = addMinutes(input.endAt, listing.bufferAfter);
    const existing = await tx.booking.findFirst({
      where: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
    });

    let booking;
    if (existing) {
      // Temporarily leave the exclusion-constraint predicate before moving a
      // previously live row. The transaction makes this neutral state invisible.
      await tx.booking.update({ where: { id: existing.id }, data: { status: 'cancelled' } });
      booking = await tx.booking.update({
        where: { id: existing.id },
        data: { code: input.code, ...bookingData },
      });
    } else {
      booking = await tx.booking.create({
        data: {
          tenantId: input.tenantId,
          code: input.code,
          idempotencyKey: input.idempotencyKey,
          status: 'cancelled',
          ...bookingData,
        },
      });
    }

    await tx.$executeRaw`
      UPDATE bookings
         SET timeslot = tstzrange(${input.startAt}::timestamptz, ${input.endAt}::timestamptz, '[)'),
             blocked_period = tstzrange(${blockedStartAt}::timestamptz, ${blockedEndAt}::timestamptz, '[)')
       WHERE id = ${booking.id}::uuid`;

    const finalBooking = await tx.booking.update({
      where: { id: booking.id },
      data: { status: input.status },
    });
    await tx.bookingStatusHistory.deleteMany({ where: { bookingId: booking.id } });
    await tx.bookingStatusHistory.createMany({
      data: input.history.map((step) => ({
        tenantId: input.tenantId,
        bookingId: booking.id,
        fromStatus: step.fromStatus,
        toStatus: step.toStatus,
        reason: step.reason,
        createdAt: step.createdAt,
      })),
    });

    return finalBooking;
  });
}

export async function ensureRoleAssignment(
  userId: string,
  roleId: string,
  tenantId: string | null,
  partnerId: string | null,
): Promise<void> {
  const existing = await prisma.roleAssignment.findFirst({
    where: { userId, roleId, tenantId, partnerId },
  });
  if (!existing) {
    await prisma.roleAssignment.create({ data: { userId, roleId, tenantId, partnerId } });
  }
}
