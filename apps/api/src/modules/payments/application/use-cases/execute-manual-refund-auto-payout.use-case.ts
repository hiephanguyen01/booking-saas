import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  ManualRefundAutoPayoutFailed,
  ManualRefundConcurrentUpdate,
  ManualRefundDestinationRequired,
  ManualRefundInvalidTransition,
  ManualRefundOperationNotFound,
  ManualRefundWorkflowPaused,
} from '../../domain/errors/manual-refund-errors';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
} from '../../domain/ports/manual-refund-operation-repository.port';
import {
  MANUAL_REFUND_PII_CRYPTO,
  type ManualRefundPiiCryptoPort,
} from '../../domain/ports/manual-refund-pii-crypto.port';
import { PAYOUT_GATEWAY, type IPayoutGatewayPort } from '../../domain/ports/payout-gateway.port';
import {
  REFUND_BATCH_REPOSITORY,
  type IRefundBatchRepository,
} from '../../domain/ports/refund-batch-repository.port';
import {
  REFUND_REPOSITORY,
  type IRefundRepository,
} from '../../domain/ports/refund-repository.port';
import { toManualRefundOperation } from '../manual-refund.mapper';
import type { ManualRefundCompletionResult } from './complete-manual-refund-transfer.use-case';

@Injectable()
export class ExecuteManualRefundAutoPayoutUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly operations: IManualRefundOperationRepository,
    @Inject(REFUND_BATCH_REPOSITORY) private readonly batches: IRefundBatchRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    @Inject(MANUAL_REFUND_PII_CRYPTO) private readonly pii: ManualRefundPiiCryptoPort,
    @Inject(PAYOUT_GATEWAY) private readonly payoutGateway: IPayoutGatewayPort,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    operationId: string,
    actorUserId: string,
  ): Promise<ManualRefundCompletionResult> {
    const prepared = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const workflow = await this.operations.getWorkflowState(tx, tenantId);
      if (workflow.paused) throw new ManualRefundWorkflowPaused();

      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();

      if (
        !current.destinationBankCode ||
        !current.destinationAccountName ||
        !current.destinationAccountCiphertext ||
        !current.destinationEncryptionKeyVersion
      ) {
        throw new ManualRefundDestinationRequired();
      }

      if (!['ready_for_transfer', 'verification_required'].includes(current.status)) {
        throw new ManualRefundInvalidTransition(current.status, 'auto_payout');
      }

      const batch = await this.batches.findById(tx, tenantId, current.refundBatchId);
      if (!batch) throw new ManualRefundOperationNotFound();

      return {
        current,
        batch,
        bankCode: current.destinationBankCode,
        accountName: current.destinationAccountName,
        ciphertext: current.destinationAccountCiphertext,
        keyVersion: current.destinationEncryptionKeyVersion,
      };
    });

    const accountNumber = this.pii.decryptAccountNumber({
      tenantId,
      operationId,
      keyVersion: prepared.keyVersion,
      ciphertext: prepared.ciphertext,
    });

    const payoutResult = await this.payoutGateway.disburse({
      tenantId,
      operationId,
      bookingCode: prepared.batch.bookingId,
      bankCode: prepared.bankCode,
      accountNumber,
      accountName: prepared.accountName,
      amountVnd: prepared.batch.requestedAmount,
      reference: operationId,
      description: `HOAN TIEN ${prepared.batch.bookingId.slice(0, 8)}`,
    });

    if (payoutResult.status !== 'succeeded') {
      throw new ManualRefundAutoPayoutFailed(payoutResult.failureReason);
    }

    const now = new Date();

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();

      const operation = toManualRefundOperation(current);
      operation.completeDirectTransfer(actorUserId, payoutResult.reference, now);

      const updated = await this.operations.casUpdate(
        tx,
        tenantId,
        operationId,
        current.status,
        current.version,
        {
          status: 'completed',
          makerUserId: actorUserId,
          transferSubmittedByUserId: actorUserId,
          transferSubmittedAt: now,
          transferReference: payoutResult.reference.trim(),
          checkedByUserId: actorUserId,
          checkedAt: now,
          completedAt: now,
        },
      );
      if (!updated) throw new ManualRefundConcurrentUpdate();

      const completedChildren = await this.refunds.completeManualBatch(
        tx,
        tenantId,
        current.refundBatchId,
        now,
        payoutResult.reference.trim(),
      );
      const refreshed = await this.batches.refreshStatus(tx, current.refundBatchId);
      if (!refreshed || refreshed.batch.status !== 'completed') {
        throw new ManualRefundConcurrentUpdate();
      }

      await this.audit.write(tx, {
        tenantId,
        actorUserId,
        action: 'manual_refund.auto_payout_completed',
        entityType: 'manual_refund_operation',
        entityId: operationId,
        data: {
          reference: payoutResult.reference.trim(),
          gatewayTxnId: payoutResult.gatewayTxnId,
          completedChildCount: completedChildren,
        },
      });

      if (refreshed.transitionedToCompleted) {
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'refund.completed',
          payload: {
            refundId: refreshed.batch.id,
            refundBatchId: refreshed.batch.id,
            bookingId: refreshed.batch.bookingId,
            amount: refreshed.batch.requestedAmount.toString(),
            reason: refreshed.batch.reason,
            affectsBookingStatus: refreshed.batch.affectsBookingStatus,
          },
        });
      }

      return {
        id: updated.id,
        status: 'completed',
        version: updated.version,
        completedAt: updated.completedAt,
      };
    });
  }
}
