import { Inject, Injectable } from '@nestjs/common';
import type { RefundHistoryQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import {
  REFUND_REPOSITORY,
  type IRefundRepository,
  type RefundHistoryRecord,
} from '../../domain/ports/refund-repository.port';

@Injectable()
export class ListTenantRefundsUseCase {
  constructor(
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    private readonly tenantContext: TenantContextService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    query: RefundHistoryQuery,
  ): Promise<{ items: RefundHistoryRecord[]; total: number }> {
    return this.tenantDb.forTenant(this.tenantContext.tenantIdOrThrow(), (tx) =>
      this.refunds.list(tx, query),
    );
  }
}
