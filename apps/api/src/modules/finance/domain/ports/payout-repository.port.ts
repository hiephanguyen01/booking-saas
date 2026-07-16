import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

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
  create(tx: PrismaTx, tenantId: string, data: CreatePayoutData): Promise<PayoutRecord>;
  findById(tx: PrismaTx, id: string): Promise<PayoutRecord | null>;
  list(tx: PrismaTx): Promise<PayoutRecord[]>;
  /** Every payout run addressed to one payee, newest first — the payee's own history. */
  listForPayee(tx: PrismaTx, payeeType: PayoutPayeeType, payeeId: string): Promise<PayoutRecord[]>;
  markPaid(tx: PrismaTx, id: string, evidence: { reference: string; evidenceKey?: string }): Promise<PayoutRecord>;
  markFailed(tx: PrismaTx, id: string, reason: string | null): Promise<PayoutRecord>;
  /** Sum of not-yet-settled payouts for a payee (pending + processing) — prevents
   *  a second payout run from double-paying the same outstanding balance. */
  outstandingForPayee(tx: PrismaTx, payeeType: PayoutPayeeType, payeeId: string): Promise<bigint>;
}
