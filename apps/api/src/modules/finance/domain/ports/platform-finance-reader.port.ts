export const PLATFORM_FINANCE_READER = Symbol('PLATFORM_FINANCE_READER');

export interface PlatformFeeRow {
  tenantId: string;
  feePayable: bigint;
}

export interface IPlatformFinanceReader {
  listPlatformFees(): Promise<PlatformFeeRow[]>;
}
