import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ResolveSettlementDisputeInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  SETTLEMENT_DISPUTE_REPOSITORY,
  type ISettlementDisputeRepository,
  type SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
} from '../../domain/ports/settlement-repository.port';

/** Tenant adjudicates an open dispute: release the hold or request a refund. */
@Injectable()
export class ResolveSettlementDisputeUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    @Inject(SETTLEMENT_DISPUTE_REPOSITORY)
    private readonly disputes: ISettlementDisputeRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(
    tenantId: string,
    disputeId: string,
    input: ResolveSettlementDisputeInput,
    actorId: string,
  ): Promise<SettlementDisputeRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const dispute = await this.disputes.findById(tx, disputeId);
      if (!dispute) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'DISPUTE_NOT_FOUND',
          message: 'Dispute not found',
        });
      }
      if (dispute.status !== 'open') return dispute;
      const settlement = await this.settlements.findById(tx, dispute.settlementId);
      if (!settlement) throw new NotFoundException();

      if (input.resolution === 'release') {
        if (!(await this.settlements.resolveDisputeForRelease(tx, settlement.id))) {
          throw new ConflictException({
            statusCode: 409,
            code: 'DISPUTE_NOT_RESOLVABLE',
            message: 'Settlement is no longer disputed',
          });
        }
        const resolved = await this.disputes.resolve(tx, disputeId, {
          status: 'rejected',
          resolution: 'release',
          note: input.note,
          refundAmount: 0n,
          resolvedBy: actorId,
        });
        if (!resolved) throw new ConflictException();
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'settlement.release_requested',
          payload: { settlementId: settlement.id },
        });
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'settlement.dispute_resolved',
          payload: { disputeId: resolved.id, bookingId: dispute.bookingId, resolution: 'release' },
        });
        return resolved;
      }

      const remainingHeld = max0(settlement.onlineHeldAmount - settlement.refundedAmount);
      const refundAmount =
        input.resolution === 'full_refund' ? remainingHeld : BigInt(input.refundAmount ?? '0');
      if (refundAmount <= 0n || refundAmount > remainingHeld) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_REFUND_AMOUNT',
          message: 'Refund amount must be positive and not exceed the remaining amount held',
        });
      }
      if (input.resolution === 'partial_refund' && refundAmount === remainingHeld) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'PARTIAL_REFUND_MUST_BE_PARTIAL',
          message: 'Use full_refund when refunding the entire held amount',
        });
      }
      await this.settlements.prepareRefund(
        tx,
        dispute.bookingId,
        settlement.refundedAmount + refundAmount,
      );
      const resolved = await this.disputes.resolve(tx, disputeId, {
        status: 'accepted',
        resolution: input.resolution,
        note: input.note,
        refundAmount,
        resolvedBy: actorId,
      });
      if (!resolved) throw new ConflictException();
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'settlement.refund_requested',
        payload: {
          bookingId: dispute.bookingId,
          amount: refundAmount.toString(),
          affectsBookingStatus: input.resolution === 'full_refund',
        },
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'settlement.dispute_resolved',
        payload: {
          disputeId: resolved.id,
          bookingId: dispute.bookingId,
          resolution: input.resolution,
        },
      });
      return resolved;
    });
  }
}

function max0(value: bigint): bigint {
  return value > 0n ? value : 0n;
}
