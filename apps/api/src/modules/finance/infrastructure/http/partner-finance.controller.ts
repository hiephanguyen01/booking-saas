import type { PartnerFinanceResponse, PayoutResponse } from '@booking/contracts';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toPartnerFinanceResponse, toPartnerPayoutResponse } from '../../application/finance.mapper';
import { GetPartnerFinanceUseCase } from '../../application/use-cases/get-partner-finance.use-case';
import { ListPartnerPayoutsUseCase } from '../../application/use-cases/list-partner-payouts.use-case';
import { PartnerFinanceResponseDto, PayoutResponseDto } from './dto/finance.dto';

/** Partner self-service finance (§13.3): current balance + ledger history. */
@ApiTags('partner-finance')
@Controller('partner/finance')
export class PartnerFinanceController {
  constructor(
    private readonly partnerFinanceUseCase: GetPartnerFinanceUseCase,
    private readonly listPayoutsUseCase: ListPartnerPayoutsUseCase,
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

  /**
   * The partner's own payout runs — every status, so a pending run (promised, not
   * yet transferred) and a failed one (reason attached) are both visible, which a
   * ledger-derived view can never show. `payeeId` is taken from the partner scope
   * in context, never from the client.
   */
  @RequirePermissions('partner.finance.read')
  @Get('payouts')
  @ApiOperation({ summary: 'Partner payout history (pending, paid and failed runs)' })
  @ApiOkResponse({ type: [PayoutResponseDto] })
  async payouts(): Promise<PayoutResponse[]> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return (await this.listPayoutsUseCase.execute(tenantId, partnerId)).map(toPartnerPayoutResponse);
  }
}
