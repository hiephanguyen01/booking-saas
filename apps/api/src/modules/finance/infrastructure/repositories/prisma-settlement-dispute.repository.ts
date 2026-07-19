import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  ISettlementDisputeRepository,
  SettlementDisputeListFilters,
  SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';

const INCLUDE = Prisma.validator<Prisma.SettlementDisputeInclude>()({
  tenant: { select: { name: true } },
  booking: {
    select: {
      code: true,
      customer: { select: { fullName: true } },
      listing: { select: { title: true } },
    },
  },
  settlement: {
    select: {
      onlineHeldAmount: true,
      refundedAmount: true,
      disputeUntil: true,
      partner: { select: { name: true } },
    },
  },
});

type Row = Prisma.SettlementDisputeGetPayload<{ include: typeof INCLUDE }>;

function toRecord(row: Row): SettlementDisputeRecord {
  return {
    ...row,
    tenantName: row.tenant.name,
    bookingCode: row.booking.code,
    listingTitle: row.booking.listing.title,
    customerName: row.booking.customer.fullName,
    partnerName: row.settlement.partner.name,
    onlineHeldAmount: row.settlement.onlineHeldAmount,
    remainingHeldAmount:
      row.settlement.onlineHeldAmount > row.settlement.refundedAmount
        ? row.settlement.onlineHeldAmount - row.settlement.refundedAmount
        : 0n,
    disputeUntil: row.settlement.disputeUntil,
    evidence: Array.isArray(row.evidence)
      ? row.evidence.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

@Injectable()
export class PrismaSettlementDisputeRepository implements ISettlementDisputeRepository {
  constructor(private readonly prisma: PrismaService) {}
  async customerOwnsBooking(tx: PrismaTx, bookingId: string, customerId: string): Promise<boolean> {
    return (await tx.booking.count({ where: { id: bookingId, customerId } })) > 0;
  }

  async findById(tx: PrismaTx, id: string): Promise<SettlementDisputeRecord | null> {
    const row = await tx.settlementDispute.findUnique({ where: { id }, include: INCLUDE });
    return row ? toRecord(row) : null;
  }

  async findLatestBySettlement(
    tx: PrismaTx,
    settlementId: string,
  ): Promise<SettlementDisputeRecord | null> {
    const row = await tx.settlementDispute.findFirst({
      where: { settlementId },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return row ? toRecord(row) : null;
  }

  async create(
    tx: PrismaTx,
    tenantId: string,
    data: {
      settlementId: string;
      bookingId: string;
      openedByUserId: string;
      openedByRole: string;
      reason: string;
      evidence: string[];
    },
  ): Promise<SettlementDisputeRecord> {
    return toRecord(
      await tx.settlementDispute.create({
        data: { ...data, tenantId, evidence: data.evidence as Prisma.InputJsonValue },
        include: INCLUDE,
      }),
    );
  }

  async resolve(
    tx: PrismaTx,
    id: string,
    data: {
      status: 'accepted' | 'rejected';
      resolution: 'release' | 'full_refund' | 'partial_refund';
      note: string;
      refundAmount: bigint;
      resolvedBy: string;
    },
  ): Promise<SettlementDisputeRecord | null> {
    const changed = await tx.$executeRaw`
      UPDATE settlement_disputes
      SET status = ${data.status}::settlement_dispute_status,
          resolution = ${data.resolution}::settlement_dispute_resolution,
          resolution_note = ${data.note},
          refund_amount = ${data.refundAmount},
          resolved_by = ${data.resolvedBy}::uuid,
          resolved_at = now(),
          updated_at = now()
      WHERE id = ${id}::uuid AND status = 'open'::settlement_dispute_status`;
    return changed > 0 ? this.findById(tx, id) : null;
  }

  async respond(
    tx: PrismaTx,
    id: string,
    partnerId: string,
    response: string,
    actorId: string,
  ): Promise<SettlementDisputeRecord | null> {
    const changed = await tx.$executeRaw`
      UPDATE settlement_disputes sd
      SET partner_response = ${response},
          partner_responded_by = ${actorId}::uuid,
          partner_responded_at = now(),
          updated_at = now()
      FROM booking_settlements bs
      WHERE sd.id = ${id}::uuid
        AND sd.settlement_id = bs.id
        AND bs.partner_id = ${partnerId}::uuid
        AND sd.status = 'open'::settlement_dispute_status
        AND sd.partner_response IS NULL`;
    return changed > 0 ? this.findById(tx, id) : null;
  }

  async list(
    tx: PrismaTx,
    page: number,
    pageSize: number,
    filters: SettlementDisputeListFilters = {},
  ): Promise<{ items: SettlementDisputeRecord[]; total: number }> {
    const where: Prisma.SettlementDisputeWhereInput = {
      status: filters.status,
      partnerResponse:
        filters.responseStatus === 'pending'
          ? null
          : filters.responseStatus === 'responded'
            ? { not: null }
            : undefined,
      createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
      settlement: filters.partnerId ? { partnerId: filters.partnerId } : undefined,
      OR: filters.q
        ? [
            { reason: { contains: filters.q, mode: 'insensitive' } },
            { booking: { code: { contains: filters.q, mode: 'insensitive' } } },
            { booking: { listing: { title: { contains: filters.q, mode: 'insensitive' } } } },
          ]
        : undefined,
    };
    const [rows, total] = await Promise.all([
      tx.settlementDispute.findMany({
        where,
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tx.settlementDispute.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async listPlatform(
    page: number,
    pageSize: number,
    filters: SettlementDisputeListFilters & { tenantId?: string },
  ): Promise<{ items: SettlementDisputeRecord[]; total: number }> {
    const where: Prisma.SettlementDisputeWhereInput = {
      tenantId: filters.tenantId,
      status: filters.status,
      partnerResponse:
        filters.responseStatus === 'pending'
          ? null
          : filters.responseStatus === 'responded'
            ? { not: null }
            : undefined,
      createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
      OR: filters.q
        ? [
            { reason: { contains: filters.q, mode: 'insensitive' } },
            { booking: { code: { contains: filters.q, mode: 'insensitive' } } },
            { booking: { listing: { title: { contains: filters.q, mode: 'insensitive' } } } },
            { tenant: { name: { contains: filters.q, mode: 'insensitive' } } },
          ]
        : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.admin.settlementDispute.findMany({
        where,
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.admin.settlementDispute.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  }
}
