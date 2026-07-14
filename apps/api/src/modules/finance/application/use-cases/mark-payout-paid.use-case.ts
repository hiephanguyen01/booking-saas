import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { MarkPayoutPaidInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  PAYOUT_REPOSITORY,
  type IPayoutRepository,
  type PayoutRecord,
} from '../../domain/ports/payout-repository.port';
import {
  LEDGER_REPOSITORY,
  type ILedgerRepository,
} from '../../domain/ports/ledger-repository.port';
import { buildPayoutJournal } from '../../domain/ledger-journal';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';

/**
 * Mark a payout paid (§13.2): write the Debit-payable / Credit-cash journal so the
 * payee's balance returns toward zero, then record the transfer evidence + audit log.
 */
@Injectable()
export class MarkPayoutPaidUseCase {
  constructor(
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: IPayoutRepository,
    @Inject(LEDGER_REPOSITORY) private readonly ledger: ILedgerRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(
    tenantId: string,
    id: string,
    input: MarkPayoutPaidInput,
    actorId: string | null,
  ): Promise<PayoutRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const payout = await this.payouts.findById(tx, id);
      if (!payout)
        throw new NotFoundException({
          statusCode: 404,
          code: 'PAYOUT_NOT_FOUND',
          message: 'Payout not found',
        });
      if (payout.status === 'paid' || payout.status === 'failed') {
        throw new BadRequestException({
          statusCode: 400,
          code: 'PAYOUT_SETTLED',
          message: `Payout already ${payout.status}`,
        });
      }

      const legs = buildPayoutJournal({
        tenantId,
        payeeType: payout.payeeType,
        payeeId: payout.payeeId,
        amount: payout.amount,
      });
      await this.ledger.recordJournal(tx, tenantId, legs, {
        payoutId: id,
        memo: `payout ${input.reference}`,
      });
      const updated = await this.payouts.markPaid(tx, id, {
        reference: input.reference,
        evidenceKey: input.evidenceKey,
      });
      await this.audit.write(tx, {
        tenantId,
        actorUserId: actorId,
        action: 'payout.paid',
        entityType: 'payout',
        entityId: id,
        data: { reference: input.reference },
      });
      // Notify the payee (§17) — the notification module emails partner members.
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'payout.paid',
        payload: {
          payoutId: id,
          payeeType: payout.payeeType,
          payeeId: payout.payeeId,
          amount: payout.amount.toString(),
        },
      });
      return updated;
    });
  }
}
