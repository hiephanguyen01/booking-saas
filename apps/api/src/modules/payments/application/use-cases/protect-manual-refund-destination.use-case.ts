import { Inject, Injectable } from '@nestjs/common';
import { ManualRefundInvalidAccountNumber } from '../../domain/errors/manual-refund-errors';
import {
  MANUAL_REFUND_PII_CRYPTO,
  type ManualRefundPiiCryptoPort,
  type ProtectedManualRefundAccount,
} from '../../domain/ports/manual-refund-pii-crypto.port';

/** Prepare customer bank PII for persistence without exposing gateway credential crypto. */
@Injectable()
export class ProtectManualRefundDestinationUseCase {
  constructor(
    @Inject(MANUAL_REFUND_PII_CRYPTO) private readonly crypto: ManualRefundPiiCryptoPort,
  ) {}

  execute(input: {
    tenantId: string;
    operationId: string;
    bankCode: string;
    accountNumber: string;
  }): ProtectedManualRefundAccount {
    const accountNumber = input.accountNumber.trim();
    if (!/^\d{4,34}$/.test(accountNumber)) throw new ManualRefundInvalidAccountNumber();
    return this.crypto.protectAccountNumber({ ...input, accountNumber });
  }
}
