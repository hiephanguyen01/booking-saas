import type { ManualRefundBreakGlassInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SESSION_STORE,
  type ISessionStore,
} from '../../../identity-access/domain/ports/session-store.port';
import {
  ManualRefundConcurrentUpdate,
  ManualRefundFreshAuthenticationRequired,
  ManualRefundMakerCannotApproveOwnTransfer,
  ManualRefundOperationNotFound,
} from '../../domain/errors/manual-refund-errors';
import {
  MANUAL_REFUND_OPERATION_REPOSITORY,
  type IManualRefundOperationRepository,
  type ManualRefundOperationRecord,
} from '../../domain/ports/manual-refund-operation-repository.port';
import {
  REFUND_BATCH_REPOSITORY,
  type IRefundBatchRepository,
} from '../../domain/ports/refund-batch-repository.port';
import {
  REFUND_REPOSITORY,
  type IRefundRepository,
} from '../../domain/ports/refund-repository.port';
import { toManualRefundOperation } from '../manual-refund.mapper';

const FRESH_AUTHENTICATION_WINDOW_MS = 5 * 60 * 1000;

interface BreakGlassActor {
  userId: string;
  sessionId: string;
  ip?: string | null;
}

export interface ManualRefundCompletionResult {
  id: string;
  status: 'completed';
  version: number;
  completedAt: Date | null;
}

@Injectable()
export class BreakGlassCompleteManualRefundUseCase {
  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY)
    private readonly operations: IManualRefundOperationRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    @Inject(REFUND_BATCH_REPOSITORY) private readonly batches: IRefundBatchRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    @Inject(SESSION_STORE) private readonly sessions: ISessionStore,
    private readonly outbox: OutboxService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    operationId: string,
    input: ManualRefundBreakGlassInput,
    actor: BreakGlassActor,
  ): Promise<ManualRefundCompletionResult> {
    const authenticatedAt = await this.sessions.authenticationTime(actor.sessionId, actor.userId);
    if (!isFreshAuthentication(authenticatedAt, new Date())) {
      throw new ManualRefundFreshAuthenticationRequired();
    }

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();
      if (current.makerUserId === actor.userId) {
        throw new ManualRefundMakerCannotApproveOwnTransfer();
      }
      if (current.status === 'completed') return toCompletionResult(current);

      const now = await this.tenantDb.databaseNow(tx);
      const operation = toManualRefundOperation(current);
      operation.completeWithBreakGlass({
        actorUserId: actor.userId,
        reason: input.reason,
        occurredAt: now,
        freshAuthenticationAt: authenticatedAt as Date,
      });
      const updated = await this.operations.casUpdate(
        tx,
        tenantId,
        operationId,
        current.status,
        input.expectedVersion,
        {
          status: 'completed',
          completedAt: now,
          breakGlassByUserId: actor.userId,
          breakGlassReason: input.reason.trim(),
          breakGlassAuthenticatedAt: authenticatedAt,
          breakGlassAt: now,
        },
      );
      if (!updated) throw new ManualRefundConcurrentUpdate();

      const completedChildren = await this.refunds.completeManualBatch(
        tx,
        tenantId,
        current.refundBatchId,
        now,
        current.transferReference as string,
      );
      const refreshed = await this.batches.refreshStatus(tx, current.refundBatchId);
      if (!refreshed || refreshed.batch.status !== 'completed') {
        throw new ManualRefundConcurrentUpdate();
      }

      await this.audit.write(tx, {
        tenantId,
        actorUserId: actor.userId,
        action: 'manual_refund.break_glass_completed',
        entityType: 'manual_refund_operation',
        entityId: operationId,
        ip: actor.ip ?? null,
        data: {
          severity: 'high',
          reason: input.reason.trim(),
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
      return toCompletionResult(updated);
    });
  }
}

function isFreshAuthentication(authenticatedAt: Date | null, now: Date): authenticatedAt is Date {
  if (!authenticatedAt || !Number.isFinite(authenticatedAt.getTime())) return false;
  const age = now.getTime() - authenticatedAt.getTime();
  return age >= 0 && age <= FRESH_AUTHENTICATION_WINDOW_MS;
}

function toCompletionResult(record: ManualRefundOperationRecord): ManualRefundCompletionResult {
  return {
    id: record.id,
    status: 'completed',
    version: record.version,
    completedAt: record.completedAt,
  };
}
