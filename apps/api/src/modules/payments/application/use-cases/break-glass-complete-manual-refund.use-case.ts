import type { ManualRefundBreakGlassInput } from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { STORAGE_PORT, type StoragePort } from '../../../storage/domain/ports/storage.port';
import {
  SESSION_STORE,
  type ISessionStore,
} from '../../../identity-access/domain/ports/session-store.port';
import {
  ManualRefundConcurrentUpdate,
  ManualRefundFreshAuthenticationRequired,
  ManualRefundMakerCannotApproveOwnTransfer,
  ManualRefundEvidenceRequired,
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
import { MANUAL_REFUND_EVIDENCE_REPOSITORY, type IManualRefundEvidenceRepository } from '../../domain/ports/manual-refund-evidence-repository.port';
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
    @Inject(MANUAL_REFUND_EVIDENCE_REPOSITORY) private readonly evidence: IManualRefundEvidenceRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
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

    const outcome = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const current = await this.operations.findById(tx, tenantId, operationId);
      if (!current) throw new ManualRefundOperationNotFound();
      if (current.makerUserId === actor.userId) {
        throw new ManualRefundMakerCannotApproveOwnTransfer();
      }
      if (current.status === 'completed') return toCompletionResult(current);
      const now = await this.tenantDb.databaseNow(tx);
      const invalidEvidenceKey = await this.retireInvalidEvidence(tx, tenantId, current, now);
      if (invalidEvidenceKey) return { invalidEvidenceKey } as const;

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
    if ('invalidEvidenceKey' in outcome) {
      try {
        await this.storage.quarantinePrivateObject(outcome.invalidEvidenceKey);
      } catch {
        // The committed quarantined row is the durable retry signal; never
        // replace the named validation error with an object-store failure.
      }
      throw new ManualRefundEvidenceRequired();
    }
    return outcome;
  }

  private async retireInvalidEvidence(
    tx: Parameters<IManualRefundEvidenceRepository['findUpload']>[0],
    tenantId: string,
    current: ManualRefundOperationRecord,
    now: Date,
  ): Promise<string | null> {
    if (!current.evidenceObjectKey || !current.evidenceSha256 || !current.evidenceContentType || !current.evidenceSizeBytes) throw new ManualRefundEvidenceRequired();
    const upload = await this.evidence.findUpload(tx, tenantId, current.id, current.evidenceObjectKey);
    if (!upload) throw new ManualRefundEvidenceRequired();
    if (upload.status !== 'claimed' || upload.checksum !== current.evidenceSha256 || upload.contentType !== current.evidenceContentType || upload.sizeBytes !== current.evidenceSizeBytes) {
      await this.evidence.quarantineUpload(tx, tenantId, upload.id, now);
      return upload.objectKey;
    }
    let inspection;
    try {
      inspection = await this.storage.inspectPrivateFile({ key: upload.objectKey, allowedContentTypes: ['application/pdf', 'image/jpeg', 'image/png'], maxSizeBytes: 10 * 1024 * 1024 });
    } catch {
      inspection = null;
    }
    if (!inspection || !inspection.valid || inspection.checksum !== upload.checksum || inspection.contentType !== upload.contentType || inspection.sizeBytes !== upload.sizeBytes) {
      await this.evidence.quarantineUpload(tx, tenantId, upload.id, now);
      return upload.objectKey;
    }
    return null;
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
