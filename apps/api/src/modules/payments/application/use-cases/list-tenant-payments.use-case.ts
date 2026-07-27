import { Inject, Injectable } from '@nestjs/common';
import type { PaymentHistoryQuery } from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
  type PaymentHistoryRecord,
} from '../../domain/ports/payment-repository.port';

@Injectable()
export class ListTenantPaymentsUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    private readonly tenantContext: TenantContextService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(query: PaymentHistoryQuery): Promise<RepoPage<PaymentHistoryRecord>> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return this.tenantDb.forTenant(tenantId, (tx) => this.payments.listTenant(tx, tenantId, query));
  }
}
