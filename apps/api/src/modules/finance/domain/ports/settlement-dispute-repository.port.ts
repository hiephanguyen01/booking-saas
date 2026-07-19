import type { SettlementDisputeResolution, SettlementDisputeStatus } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const SETTLEMENT_DISPUTE_REPOSITORY = Symbol('SETTLEMENT_DISPUTE_REPOSITORY');

export interface SettlementDisputeRecord {
  id: string;
  tenantId: string;
  tenantName?: string;
  settlementId: string;
  bookingId: string;
  openedByUserId: string;
  openedByRole: string;
  bookingCode: string | null;
  listingTitle: string | null;
  customerName: string | null;
  partnerName: string | null;
  onlineHeldAmount: bigint;
  remainingHeldAmount: bigint;
  disputeUntil: Date | null;
  reason: string;
  evidence: string[];
  partnerResponse: string | null;
  partnerRespondedBy: string | null;
  partnerRespondedAt: Date | null;
  status: SettlementDisputeStatus;
  resolution: SettlementDisputeResolution | null;
  resolutionNote: string | null;
  refundAmount: bigint;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SettlementDisputeListFilters {
  partnerId?: string;
  status?: SettlementDisputeStatus;
  responseStatus?: 'pending' | 'responded';
  from?: Date;
  to?: Date;
  q?: string;
}

export interface ISettlementDisputeRepository {
  customerOwnsBooking(tx: PrismaTx, bookingId: string, customerId: string): Promise<boolean>;
  findById(tx: PrismaTx, id: string): Promise<SettlementDisputeRecord | null>;
  findLatestBySettlement(
    tx: PrismaTx,
    settlementId: string,
  ): Promise<SettlementDisputeRecord | null>;
  create(
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
  ): Promise<SettlementDisputeRecord>;
  resolve(
    tx: PrismaTx,
    id: string,
    data: {
      status: 'accepted' | 'rejected';
      resolution: SettlementDisputeResolution;
      note: string;
      refundAmount: bigint;
      resolvedBy: string;
    },
  ): Promise<SettlementDisputeRecord | null>;
  respond(
    tx: PrismaTx,
    id: string,
    partnerId: string,
    response: string,
    actorId: string,
  ): Promise<SettlementDisputeRecord | null>;
  list(
    tx: PrismaTx,
    page: number,
    pageSize: number,
    filters?: SettlementDisputeListFilters,
  ): Promise<{ items: SettlementDisputeRecord[]; total: number }>;
  listPlatform(
    page: number,
    pageSize: number,
    filters: SettlementDisputeListFilters & { tenantId?: string },
  ): Promise<{ items: SettlementDisputeRecord[]; total: number }>;
}
