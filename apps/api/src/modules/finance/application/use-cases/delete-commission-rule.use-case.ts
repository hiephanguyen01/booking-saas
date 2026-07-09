import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';

/** Delete a commission rule — the tenant default is protected (a booking must always resolve a rate). */
@Injectable()
export class DeleteCommissionRuleUseCase {
  constructor(
    @Inject(COMMISSION_RULE_REPOSITORY) private readonly rules: ICommissionRuleRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, id: string): Promise<void> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const found = await this.rules.findById(tx, id);
      if (!found) throw new NotFoundException({ statusCode: 404, code: 'RULE_NOT_FOUND', message: 'Commission rule not found' });
      if (found.appliesTo === 'tenant_default') {
        throw new BadRequestException({ statusCode: 400, code: 'DEFAULT_RULE_LOCKED', message: 'The tenant default rule cannot be deleted' });
      }
      await this.rules.delete(tx, id);
    });
  }
}
