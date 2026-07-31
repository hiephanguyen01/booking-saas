import { Inject, Injectable } from '@nestjs/common';
import type { AcceptanceRecord } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  AGREEMENT_ACCEPTANCE_REPOSITORY,
  type IAgreementAcceptanceRepository,
} from '../../domain/ports/agreement-acceptance-repository.port';
import { toAcceptanceRecord } from '../legal.mapper';

/** The storefront account page's "điều khoản tôi đã đồng ý" list, newest first. */
@Injectable()
export class ListMyAcceptancesUseCase {
  constructor(
    @Inject(AGREEMENT_ACCEPTANCE_REPOSITORY) private readonly acceptances: IAgreementAcceptanceRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, userId: string): Promise<AcceptanceRecord[]> {
    const rows = await this.tenantDb.forTenant(tenantId, (tx) => this.acceptances.listByUser(tx, userId));
    return rows.map(toAcceptanceRecord);
  }
}
