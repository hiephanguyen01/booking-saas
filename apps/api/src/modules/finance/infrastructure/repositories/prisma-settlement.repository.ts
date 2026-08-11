import { Injectable } from '@nestjs/common';
import { Prisma, type BookingSettlement } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type {
  ISettlementRepository,
  ReleaseAmounts,
  SettlementListFilters,
  SettlementRecord,
  SettlementSummary,
} from '../../domain/ports/settlement-repository.port';
import { pageOffset } from '../../../../shared/pagination/pagination';

type EnrichedRow = BookingSettlement & {
  booking?: {
    code: string;
    listing: { title: string };
    customer: { fullName: string };
  };
  partner?: { name: string };
  tenant?: { name: string };
  payoutAllocations?: Array<{
    amount: bigint;
    status: 'reserved' | 'paid' | 'released';
    payout: {
      id: string;
      status: 'pending' | 'processing' | 'paid' | 'failed';
      paidAt: Date | null;
      evidence: unknown;
      createdAt: Date;
    };
  }>;
};

const ENRICH_INCLUDE = Prisma.validator<Prisma.BookingSettlementInclude>()({
  booking: {
    select: {
      code: true,
      listing: { select: { title: true } },
      customer: { select: { fullName: true } },
    },
  },
  partner: { select: { name: true } },
  tenant: { select: { name: true } },
  payoutAllocations: {
    where: { status: { in: ['reserved', 'paid'] } },
    include: { payout: true },
  },
});

function toRecord(row: EnrichedRow): SettlementRecord {
  const allocations = row.payoutAllocations ?? [];
  const payoutPendingAmount = allocations
    .filter(
      (item) =>
        item.status === 'reserved' && ['pending', 'processing'].includes(item.payout.status),
    )
    .reduce((sum, item) => sum + item.amount, 0n);
  const paidAmount = allocations
    .filter((item) => item.status === 'paid' && item.payout.status === 'paid')
    .reduce((sum, item) => sum + item.amount, 0n);
  const latest = [...allocations].sort(
    (a, b) => b.payout.createdAt.getTime() - a.payout.createdAt.getTime(),
  )[0]?.payout;
  const evidence = latest?.evidence as { reference?: string } | null | undefined;
  const remainingPayableAmount =
    row.partnerPayable > payoutPendingAmount + paidAmount
      ? row.partnerPayable - payoutPendingAmount - paidAmount
      : 0n;
  // Listed field by field on purpose: `...row` used to carry the whole Prisma row
  // — including the nested `booking` / `tenant` / `partner` relation objects —
  // into the record, so a persistence-only key was one careless mapper edit away
  // from becoming a wire contract.
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenant?.name ?? null,
    bookingId: row.bookingId,
    paymentId: row.paymentId,
    partnerId: row.partnerId,
    status: row.status,
    kind: row.kind,
    bookingCode: row.booking?.code ?? null,
    listingTitle: row.booking?.listing.title ?? null,
    customerName: row.booking?.customer.fullName ?? null,
    partnerName: row.partner?.name ?? null,
    onlineHeldAmount: row.onlineHeldAmount,
    onsiteCollectedAmount: row.onsiteCollectedAmount,
    securityDepositHeld: row.securityDepositHeld,
    tenantCommissionGross: row.tenantCommissionGross,
    tenantNetEarning: row.tenantNetEarning,
    partnerGrossEarning: row.partnerGrossEarning,
    partnerPayable: row.partnerPayable,
    partnerVatWithheld: row.partnerVatWithheld,
    partnerPitWithheld: row.partnerPitWithheld,
    platformFee: row.platformFee,
    affiliateCommission: row.affiliateCommission,
    refundedAmount: row.refundedAmount,
    retainedAmount: row.retainedAmount,
    refundId: row.refundId,
    payoutPendingAmount,
    paidAmount,
    remainingPayableAmount,
    latestPayoutId: latest?.id ?? null,
    latestPayoutStatus: latest?.status ?? null,
    latestPayoutReference: evidence?.reference ?? null,
    latestPayoutPaidAt: latest?.paidAt ?? null,
    completedAt: row.completedAt,
    disputeUntil: row.disputeUntil,
    releasedAt: row.releasedAt,
    releaseJournalId: row.releaseJournalId,
    withholdingJournalId: row.withholdingJournalId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaSettlementRepository implements ISettlementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createHeldFromPayment(
    tx: PrismaTx,
    tenantId: string,
    paymentId: string,
  ): Promise<SettlementRecord | null> {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { booking: { select: { id: true, partnerId: true, securityDeposit: true } } },
    });
    if (!payment || payment.status !== 'succeeded') return null;
    // Custody is derived from EVERY succeeded payment on the booking, not just
    // this one, because a balance payment (§8.3) is a second payment on an
    // already-confirmed booking and the held funds must cover both.
    const paid = await tx.payment.aggregate({
      where: { bookingId: payment.bookingId, status: 'succeeded' },
      _sum: { amount: true },
    });
    const totalPaid = paid._sum.amount ?? 0n;
    // The security deposit is taken once, with the first payment; the rest is
    // service money. Identical to the old single-payment maths when there is one.
    const securityDepositHeld =
      payment.booking.securityDeposit < totalPaid ? payment.booking.securityDeposit : totalPaid;
    const onlineHeldAmount = totalPaid - securityDepositHeld;
    return toRecord(
      await tx.bookingSettlement.upsert({
        where: { bookingId: payment.bookingId },
        create: {
          tenantId,
          bookingId: payment.bookingId,
          paymentId,
          partnerId: payment.booking.partnerId,
          onlineHeldAmount,
          securityDepositHeld,
        },
        // SET from the derived total, never `{ increment }`: outbox delivery is
        // at-least-once, and an increment would inflate custody — and every split
        // derived from it — on a redelivery. Recomputing from the source of truth
        // lands on the same number however many times it runs.
        //
        // `payment_id` deliberately keeps pointing at the deposit: the column is
        // unique and one settlement serves one booking, so an automatic gateway
        // refund can only target that first transaction and anything larger uses
        // the existing manual refund flow.
        update: { onlineHeldAmount, securityDepositHeld },
      }),
    );
  }

  async ensureHeldForBooking(
    tx: PrismaTx,
    tenantId: string,
    bookingId: string,
  ): Promise<SettlementRecord | null> {
    const existing = await this.findByBooking(tx, bookingId);
    if (existing) return existing;
    const payment = await tx.payment.findFirst({
      where: {
        bookingId,
        status: 'succeeded',
        kind: { in: ['deposit', 'full'] },
      },
      select: { id: true },
      orderBy: [{ paidAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    return payment ? this.createHeldFromPayment(tx, tenantId, payment.id) : null;
  }

  async findByBooking(tx: PrismaTx, bookingId: string): Promise<SettlementRecord | null> {
    const row = await tx.bookingSettlement.findUnique({
      where: { bookingId },
      include: ENRICH_INCLUDE,
    });
    return row ? toRecord(row) : null;
  }

  async findById(tx: PrismaTx, id: string): Promise<SettlementRecord | null> {
    const row = await tx.bookingSettlement.findUnique({ where: { id }, include: ENRICH_INCLUDE });
    return row ? toRecord(row) : null;
  }

  async startDisputeWindow(
    tx: PrismaTx,
    bookingId: string,
    onsiteCollectedAmount: bigint,
    holdingDays: number,
    amounts: ReleaseAmounts,
    kind: SettlementRecord['kind'] = 'service_completed',
  ): Promise<SettlementRecord | null> {
    await tx.$executeRaw`
      UPDATE booking_settlements
      SET status = 'dispute_window'::settlement_status,
          kind = ${kind}::settlement_kind,
          onsite_collected_amount = ${onsiteCollectedAmount},
          completed_at = now(),
          dispute_until = now() + (${holdingDays} * interval '1 day'),
          tenant_commission_gross = ${amounts.tenantCommissionGross},
          tenant_net_earning = ${amounts.tenantNetEarning},
          partner_gross_earning = ${amounts.partnerGrossEarning},
          partner_payable = ${amounts.partnerPayable},
          partner_vat_withheld = ${amounts.partnerVatWithheld},
          partner_pit_withheld = ${amounts.partnerPitWithheld},
          platform_fee = ${amounts.platformFee},
          affiliate_commission = ${amounts.affiliateCommission},
          retained_amount = CASE
            WHEN ${kind}::settlement_kind = 'cancellation_fee'::settlement_kind
              THEN GREATEST(online_held_amount - refunded_amount, 0)
            ELSE retained_amount
          END,
          updated_at = now()
      WHERE booking_id = ${bookingId}::uuid
        AND status = 'held'::settlement_status`;
    return this.findByBooking(tx, bookingId);
  }

  async prepareRefund(
    tx: PrismaTx,
    bookingId: string,
    refundAmount: bigint,
    kind?: SettlementRecord['kind'],
  ): Promise<SettlementRecord | null> {
    await tx.$executeRaw`
      UPDATE booking_settlements
      SET status = 'refund_pending'::settlement_status,
          kind = COALESCE(${kind ?? null}::settlement_kind, kind),
          refunded_amount = LEAST(${refundAmount}, online_held_amount),
          retained_amount = GREATEST(online_held_amount - ${refundAmount}, 0),
          updated_at = now()
      WHERE booking_id = ${bookingId}::uuid
        AND status IN ('held', 'dispute_window', 'disputed')`;
    return this.findByBooking(tx, bookingId);
  }

  async finalizeRefund(
    tx: PrismaTx,
    bookingId: string,
    refundId: string,
    refundedAmount: bigint,
    holdingDays: number,
  ): Promise<SettlementRecord | null> {
    await tx.$executeRaw`
      UPDATE booking_settlements
      SET status = CASE
            WHEN ${refundedAmount} >= online_held_amount
              THEN 'refunded'::settlement_status
            ELSE 'dispute_window'::settlement_status
          END,
          refund_id = ${refundId}::uuid,
          refunded_amount = LEAST(${refundedAmount}, online_held_amount),
          retained_amount = GREATEST(online_held_amount - ${refundedAmount}, 0),
          completed_at = CASE WHEN ${refundedAmount} < online_held_amount THEN now() ELSE completed_at END,
          dispute_until = CASE
            WHEN ${refundedAmount} < online_held_amount
              THEN now() + (${holdingDays} * interval '1 day')
            ELSE NULL
          END,
          updated_at = now()
      WHERE booking_id = ${bookingId}::uuid
        AND status IN ('held', 'dispute_window', 'disputed', 'refund_pending', 'released')`;
    return this.findByBooking(tx, bookingId);
  }

  async markDisputed(tx: PrismaTx, settlementId: string): Promise<boolean> {
    const changed = await tx.$executeRaw`
      UPDATE booking_settlements
      SET status = 'disputed'::settlement_status, updated_at = now()
      WHERE id = ${settlementId}::uuid
        AND status = 'dispute_window'::settlement_status
        AND dispute_until > now()`;
    return changed > 0;
  }

  async resolveDisputeForRelease(tx: PrismaTx, settlementId: string): Promise<boolean> {
    const changed = await tx.$executeRaw`
      UPDATE booking_settlements
      SET status = 'dispute_window'::settlement_status,
          dispute_until = now(),
          updated_at = now()
      WHERE id = ${settlementId}::uuid
        AND status = 'disputed'::settlement_status`;
    return changed > 0;
  }

  async markReleased(
    tx: PrismaTx,
    id: string,
    journalId: string,
    amounts: ReleaseAmounts,
  ): Promise<SettlementRecord | null> {
    const changed = await tx.$executeRaw`
      UPDATE booking_settlements
      SET status = 'released'::settlement_status,
          released_at = now(),
          release_journal_id = ${journalId}::uuid,
          tenant_commission_gross = ${amounts.tenantCommissionGross},
          tenant_net_earning = ${amounts.tenantNetEarning},
          partner_gross_earning = ${amounts.partnerGrossEarning},
          partner_payable = ${amounts.partnerPayable},
          partner_vat_withheld = ${amounts.partnerVatWithheld},
          partner_pit_withheld = ${amounts.partnerPitWithheld},
          platform_fee = ${amounts.platformFee},
          affiliate_commission = ${amounts.affiliateCommission},
          updated_at = now()
      WHERE id = ${id}::uuid
        AND status = 'dispute_window'::settlement_status
        AND dispute_until <= now()`;
    if (changed === 0) return null;
    const row = await tx.bookingSettlement.findUnique({ where: { id }, include: ENRICH_INCLUDE });
    return row ? toRecord(row) : null;
  }

  async list(
    tx: PrismaTx,
    page: number,
    pageSize: number,
    filters: SettlementListFilters,
  ): Promise<RepoPage<SettlementRecord>> {
    const where: Prisma.BookingSettlementWhereInput = {
      status: filters.status,
      partnerId: filters.partnerId,
    };
    const { skip, take } = pageOffset({ page, pageSize });
    const [items, total] = await Promise.all([
      tx.bookingSettlement.findMany({
        where,
        include: ENRICH_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      tx.bookingSettlement.count({ where }),
    ]);
    return { items: items.map(toRecord), total };
  }

  async findDue(limit: number): Promise<Array<{ id: string; tenantId: string }>> {
    return this.prisma.admin.$queryRaw<Array<{ id: string; tenantId: string }>>`
      SELECT id, tenant_id AS "tenantId"
      FROM booking_settlements
      WHERE status = 'dispute_window'::settlement_status
        AND dispute_until <= now()
      ORDER BY dispute_until ASC
      LIMIT ${limit}`;
  }

  async listPlatform(
    page: number,
    pageSize: number,
    filters: SettlementListFilters,
  ): Promise<RepoPage<SettlementRecord>> {
    const where: Prisma.BookingSettlementWhereInput = {
      status: filters.status,
      partnerId: filters.partnerId,
    };
    const { skip, take } = pageOffset({ page, pageSize });
    const [items, total] = await Promise.all([
      this.prisma.admin.bookingSettlement.findMany({
        where,
        include: ENRICH_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.admin.bookingSettlement.count({ where }),
    ]);
    return { items: items.map(toRecord), total };
  }

  async summarize(tx: PrismaTx, partnerId?: string): Promise<SettlementSummary> {
    const rows = await tx.$queryRaw<
      Array<{
        status: SettlementRecord['status'];
        count: bigint;
        onlineHeld: bigint;
        partnerPayable: bigint;
        payoutPending: bigint;
        paid: bigint;
      }>
    >(Prisma.sql`
      WITH per_settlement AS (
        SELECT bs.id, bs.status,
               GREATEST(bs.online_held_amount - bs.refunded_amount, 0)::bigint AS online_held_amount,
               bs.partner_payable,
               COALESCE(SUM(pa.amount) FILTER (
                 WHERE pa.status = 'reserved' AND p.status IN ('pending', 'processing')
               ), 0)::bigint AS payout_pending,
               COALESCE(SUM(pa.amount) FILTER (
                 WHERE pa.status = 'paid' AND p.status = 'paid'
               ), 0)::bigint AS paid
        FROM booking_settlements bs
        LEFT JOIN payout_allocations pa ON pa.settlement_id = bs.id
        LEFT JOIN payouts p ON p.id = pa.payout_id
        WHERE (${partnerId ?? null}::uuid IS NULL OR bs.partner_id = ${partnerId ?? null}::uuid)
        GROUP BY bs.id
      )
      SELECT status::text AS status,
             COUNT(*)::bigint AS count,
             COALESCE(SUM(online_held_amount), 0)::bigint AS "onlineHeld",
             COALESCE(SUM(partner_payable), 0)::bigint AS "partnerPayable",
             COALESCE(SUM(payout_pending), 0)::bigint AS "payoutPending",
             COALESCE(SUM(paid), 0)::bigint AS paid
      FROM per_settlement
      GROUP BY status`);
    const counts = {
      held: 0,
      dispute_window: 0,
      disputed: 0,
      refund_pending: 0,
      released: 0,
      refunded: 0,
    } satisfies Record<SettlementRecord['status'], number>;
    let heldAmount = 0n;
    let disputedAmount = 0n;
    let heldPartnerPayableAmount = 0n;
    let disputedPartnerPayableAmount = 0n;
    let refundPendingAmount = 0n;
    let releasedPayableAmount = 0n;
    let payoutPendingAmount = 0n;
    let paidAmount = 0n;
    for (const row of rows) {
      counts[row.status] = Number(row.count);
      if (row.status === 'held' || row.status === 'dispute_window') {
        heldAmount += row.onlineHeld;
        heldPartnerPayableAmount += row.partnerPayable;
      }
      if (row.status === 'disputed') {
        disputedAmount += row.onlineHeld;
        disputedPartnerPayableAmount += row.partnerPayable;
      }
      if (row.status === 'refund_pending') refundPendingAmount += row.onlineHeld;
      if (row.status === 'released') releasedPayableAmount += row.partnerPayable;
      payoutPendingAmount += row.payoutPending;
      paidAmount += row.paid;
    }
    return {
      heldAmount,
      disputedAmount,
      heldPartnerPayableAmount,
      disputedPartnerPayableAmount,
      refundPendingAmount,
      releasedPayableAmount,
      payoutPendingAmount,
      paidAmount,
      remainingPayableAmount:
        releasedPayableAmount > payoutPendingAmount + paidAmount
          ? releasedPayableAmount - payoutPendingAmount - paidAmount
          : 0n,
      counts,
    };
  }
}
