import type { PartnerFinanceResponse } from '@booking/contracts';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toPartnerFinanceResponse } from '../../application/finance.mapper';
import { GetPartnerFinanceUseCase } from '../../application/use-cases/get-partner-finance.use-case';
import { PartnerFinanceResponseDto } from './dto/finance.dto';

/** Partner self-service finance (§13.3): current balance + ledger history. */
@ApiTags('partner-finance')
@Controller('partner/finance')
export class PartnerFinanceController {
  constructor(
    private readonly partnerFinanceUseCase: GetPartnerFinanceUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.finance.read')
  @Get()
  @ApiOperation({ summary: 'Partner current balance + ledger history' })
  @ApiOkResponse({ type: PartnerFinanceResponseDto })
  async finance(): Promise<PartnerFinanceResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerFinanceResponse(await this.partnerFinanceUseCase.execute(tenantId, partnerId));
  }
}
