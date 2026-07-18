import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { OpenSettlementDisputeInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  FINANCE_TENANT_HOST_READER,
  type IFinanceTenantHostReader,
} from '../../domain/ports/finance-tenant-host-reader.port';
import {
  SETTLEMENT_DISPUTE_REPOSITORY,
  type ISettlementDisputeRepository,
  type SettlementDisputeRecord,
} from '../../domain/ports/settlement-dispute-repository.port';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
} from '../../domain/ports/settlement-repository.port';

/** Customer opens a claim only for their booking and before the DB deadline. */
@Injectable()
export class OpenSettlementDisputeUseCase {
  constructor(
    @Inject(FINANCE_TENANT_HOST_READER) private readonly tenants: IFinanceTenantHostReader,
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    @Inject(SETTLEMENT_DISPUTE_REPOSITORY)
    private readonly disputes: ISettlementDisputeRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    customerId: string,
    input: OpenSettlementDisputeInput,
  ): Promise<SettlementDisputeRecord> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      if (!(await this.disputes.customerOwnsBooking(tx, input.bookingId, customerId))) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found',
        });
      }
      const settlement = await this.settlements.findByBooking(tx, input.bookingId);
      if (!settlement) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'SETTLEMENT_NOT_FOUND',
          message: 'Settlement not found',
        });
      }
      const existing = await this.disputes.findLatestBySettlement(tx, settlement.id);
      if (existing?.status === 'open') return existing;
      if (existing) {
        throw new ConflictException({
          statusCode: 409,
          code: 'DISPUTE_ALREADY_RESOLVED',
          message: 'This settlement has already used its dispute review',
        });
      }
      if (!(await this.settlements.markDisputed(tx, settlement.id))) {
        throw new ConflictException({
          statusCode: 409,
          code: 'DISPUTE_WINDOW_CLOSED',
          message: 'The settlement is not inside an open dispute window',
        });
      }
      return this.disputes.create(tx, tenantId, {
        settlementId: settlement.id,
        bookingId: input.bookingId,
        openedByUserId: customerId,
        openedByRole: 'customer',
        reason: input.reason,
        evidence: input.evidence,
      });
    });
  }
}
