import type {
  ManualRefundStatusResponse,
  SubmitManualRefundDestinationInput,
} from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  ManualRefundConcurrentUpdate,
  ManualRefundThirdPartyConsentRequired,
} from '../../domain/errors/manual-refund-errors';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
} from '../../domain/ports/manual-refund-operation-repository.port';
import {
  ACCOUNT_NAME_LOOKUP,
  type AccountNameLookupPort,
} from '../../domain/ports/account-name-lookup.port';
import {
  REFUND_BATCH_REPOSITORY,
  type IRefundBatchRepository,
} from '../../domain/ports/refund-batch-repository.port';
import { loadCustomerManualRefund } from '../manual-refund-customer-access';
import {
  toCustomerManualRefundStatusResponse,
  toManualRefundOperation,
} from '../manual-refund.mapper';
import { ProtectManualRefundDestinationUseCase } from './protect-manual-refund-destination.use-case';

@Injectable()
export class SubmitCustomerManualRefundDestinationUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly operations: IManualRefundOperationRepository,
    @Inject(REFUND_BATCH_REPOSITORY) private readonly batches: IRefundBatchRepository,
    @Inject(ACCOUNT_NAME_LOOKUP) private readonly accountNameLookup: AccountNameLookupPort,
    private readonly protectDestination: ProtectManualRefundDestinationUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    bookingId: string,
    bookingCode: string,
    operationId: string,
    input: SubmitManualRefundDestinationInput,
    proof: { thirdPartyOtpConsentVerified: boolean },
  ): Promise<ManualRefundStatusResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const { operation: current, batch } = await loadCustomerManualRefund(
        tx,
        this.operations,
        this.batches,
        tenantId,
        bookingId,
        operationId,
      );
      if (current.version !== input.expectedVersion) throw new ManualRefundConcurrentUpdate();
      if (input.isThirdParty && (!input.thirdPartyConsent || !proof.thirdPartyOtpConsentVerified)) {
        throw new ManualRefundThirdPartyConsentRequired();
      }

      const entity = toManualRefundOperation(current);
      entity.assertDestinationReplaceable();
      const bankCode = input.bankCode.trim();
      const accountNumber = input.accountNumber.trim();
      const accountName = input.accountName.trim().replace(/\s+/gu, ' ');
      const lookupResult = await this.accountNameLookup.lookup({
        bankCode,
        accountNumber,
        expectedAccountName: accountName,
      });
      const protectedAccount = this.protectDestination.execute({
        tenantId,
        operationId,
        bankCode,
        accountNumber,
      });
      const now = await this.tenantDb.databaseNow(tx);

      entity.recordDestinationVerification(lookupResult.status);
      const next = entity.snapshot();
      const lookupCompleted = ['matched', 'mismatch'].includes(lookupResult.status);
      const updated = await this.operations.casUpdate(
        tx,
        tenantId,
        operationId,
        current.status,
        current.version,
        {
          status: next.status,
          destinationBankCode: bankCode,
          destinationAccountName: accountName,
          destinationAccountLast4: protectedAccount.last4,
          destinationAccountCiphertext: protectedAccount.ciphertext,
          destinationEncryptionKeyVersion: protectedAccount.keyVersion,
          destinationAccountFingerprint: protectedAccount.fingerprint,
          destinationIsThirdParty: input.isThirdParty,
          destinationConsentAt: input.isThirdParty ? now : null,
          destinationSubmittedAt: now,
          verificationResult: lookupResult.status,
          verificationMethod: lookupResult.status === 'unsupported' ? null : 'lookup',
          verifiedByUserId: null,
          verifiedAt: lookupCompleted ? now : null,
          readyAt: lookupResult.status === 'matched' ? now : null,
          transferDueAt: null,
        },
      );
      if (!updated) throw new ManualRefundConcurrentUpdate();
      return toCustomerManualRefundStatusResponse(updated, batch, bookingCode);
    });
  }
}
