import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PAYOUT_REPOSITORY,
  type IPayoutRepository,
  type PayoutRecord,
} from '../../domain/ports/payout-repository.port';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { Payout } from '../../domain/entities/payout.entity';
import { PayoutNotFound } from '../../domain/errors/finance-domain-errors';

/**
 * Mark a payout failed (§7.7). No ledger journal was written for a pending payout,
 * so the shares simply stay payable and roll into the next cycle.
 */
@Injectable()
export class FailPayoutUseCase {
  constructor(
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: IPayoutRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    id: string,
    reason: string | null,
    actorId: string | null,
  ): Promise<PayoutRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const payout = await this.payouts.findById(tx, id);
      if (!payout) throw new PayoutNotFound();
      Payout.rehydrate(payout).classifyFailure();
      const updated = await this.payouts.markFailed(tx, id, reason);
      Payout.assertStateUpdated(updated);
      await this.payouts.releaseAllocations(tx, id);
      await this.audit.write(tx, {
        tenantId,
        actorUserId: actorId,
        action: 'payout.failed',
        entityType: 'payout',
        entityId: id,
        data: { reason },
      });
      return updated;
    });
  }
}
