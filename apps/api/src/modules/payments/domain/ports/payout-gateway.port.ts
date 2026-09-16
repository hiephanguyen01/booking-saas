export const PAYOUT_GATEWAY = Symbol('PAYOUT_GATEWAY');

export interface PayoutDisburseInput {
  tenantId: string;
  operationId: string;
  bookingCode: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  amountVnd: bigint;
  reference: string;
  description: string;
}

export interface PayoutDisburseResult {
  status: 'succeeded' | 'failed' | 'pending';
  reference: string;
  gatewayTxnId?: string;
  failureReason?: string;
}

export interface IPayoutGatewayPort {
  disburse(input: PayoutDisburseInput): Promise<PayoutDisburseResult>;
}
