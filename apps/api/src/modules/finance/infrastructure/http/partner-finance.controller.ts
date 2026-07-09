import { Controller, Get } from '@nestjs/common';
import type { PartnerFinanceResponse } from '@booking/shared';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { GetPartnerFinanceUseCase } from '../../application/use-cases/get-partner-finance.use-case';
import { toPartnerFinanceResponse } from '../../application/finance.mapper';

/** Partner self-service finance (§13.3): current balance + ledger history. */
@Controller('partner/finance')
export class PartnerFinanceController {
  constructor(
    private readonly partnerFinanceUseCase: GetPartnerFinanceUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.finance.read')
  @Get()
  async finance(): Promise<PartnerFinanceResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerFinanceResponse(await this.partnerFinanceUseCase.execute(tenantId, partnerId));
  }
}
