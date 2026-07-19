import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
} from '../../domain/ports/settlement-repository.port';

/** `payment.succeeded` → create the tenant-custodied held-funds record. */
@Injectable()
export class RecordHeldSettlementUseCase {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, paymentId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      await this.settlements.createHeldFromPayment(tx, tenantId, paymentId);
    });
  }
}
