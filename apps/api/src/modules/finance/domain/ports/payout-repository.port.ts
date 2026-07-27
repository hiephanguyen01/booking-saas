import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';

export const PAYOUT_REPOSITORY = Symbol('PAYOUT_REPOSITORY');

export type PayoutPayeeType = 'partner' | 'affiliate';
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

export interface PayoutRecord {
  id: string;
  tenantId: string;
  payeeType: PayoutPayeeType;
  payeeId: string;
  amount: bigint;
  periodFrom: Date | null;
  periodTo: Date | null;
  status: PayoutStatus;
  paidAt: Date | null;
  evidence: { reference?: string; evidenceKey?: string; failureReason?: string } | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface CreatePayoutData {
  payeeType: PayoutPayeeType;
  payeeId: string;
  amount: bigint;
  periodFrom: Date | null;
  periodTo: Date | null;
  createdBy: string | null;
}

export interface IPayoutRepository {
  lockPayee(tx: PrismaTx, payeeType: PayoutPayeeType, payeeId: string): Promise<void>;
  create(tx: PrismaTx, tenantId: string, data: CreatePayoutData): Promise<PayoutRecord>;
  findById(tx: PrismaTx, id: string): Promise<PayoutRecord | null>;
  list(
    tx: PrismaTx,
    params: { page: number; pageSize: number },
  ): Promise<RepoPage<PayoutRecord>>;
  /** Every payout run addressed to one payee, newest first — the payee's own history. */
  listForPayee(
    tx: PrismaTx,
    payeeType: PayoutPayeeType,
    payeeId: string,
    params: { page: number; pageSize: number },
  ): Promise<RepoPage<PayoutRecord>>;
  claimForPayment(tx: PrismaTx, id: string): Promise<PayoutRecord | null>;
  markPaid(tx: PrismaTx, id: string, evidence: { reference: string; evidenceKey?: string }): Promise<PayoutRecord | null>;
  markFailed(tx: PrismaTx, id: string, reason: string | null): Promise<PayoutRecord | null>;
  allocateReleasedSettlements(
    tx: PrismaTx,
    tenantId: string,
    payoutId: string,
    partnerId: string,
    amount: bigint,
  ): Promise<bigint>;
  markAllocationsPaid(tx: PrismaTx, payoutId: string): Promise<void>;
  releaseAllocations(tx: PrismaTx, payoutId: string): Promise<void>;
  /** Sum of not-yet-settled payouts for a payee (pending + processing) — prevents
   *  a second payout run from double-paying the same outstanding balance. */
  outstandingForPayee(tx: PrismaTx, payeeType: PayoutPayeeType, payeeId: string): Promise<bigint>;
}
