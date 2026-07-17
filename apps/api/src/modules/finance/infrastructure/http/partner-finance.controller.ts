import type {
  LedgerEntryResponse,
  Paginated,
  PartnerFinanceResponse,
  PayoutResponse,
} from '@booking/contracts';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { PaginationQueryDto } from '../../../../shared/pagination/pagination.dto';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import {
  toLedgerEntryResponse,
  toPartnerFinanceResponse,
  toPartnerPayoutResponse,
} from '../../application/finance.mapper';
import { GetPartnerFinanceUseCase } from '../../application/use-cases/get-partner-finance.use-case';
import { ListPartnerLedgerUseCase } from '../../application/use-cases/list-partner-ledger.use-case';
import { ListPartnerPayoutsUseCase } from '../../application/use-cases/list-partner-payouts.use-case';
import {
  LedgerEntryResponseDto,
  PartnerFinanceResponseDto,
  PartnerLedgerQueryDto,
  PayoutResponseDto,
} from './dto/finance.dto';

/** Partner self-service finance (§13.3): current balance + ledger history. */
@ApiTags('partner-finance')
@Controller('partner/finance')
export class PartnerFinanceController {
  constructor(
    private readonly partnerFinanceUseCase: GetPartnerFinanceUseCase,
    private readonly listLedgerUseCase: ListPartnerLedgerUseCase,
    private readonly listPayoutsUseCase: ListPartnerPayoutsUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.finance.read')
  @Get()
  @ApiOperation({ summary: 'Partner current balance + recent ledger preview' })
  @ApiOkResponse({ type: PartnerFinanceResponseDto })
  async finance(): Promise<PartnerFinanceResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerFinanceResponse(await this.partnerFinanceUseCase.execute(tenantId, partnerId));
  }

  /**
   * The partner's full ledger journal, paginated + filterable — the complete
   * history behind the balance preview on `GET /partner/finance`. Owner is forced
   * to the partner in scope, so a partner only ever reads its own entries.
   */
  @RequirePermissions('partner.finance.read')
  @Get('ledger')
  @ApiOperation({ summary: 'Partner ledger history (paginated, filter by entry type + date range)' })
  @ApiPaginatedResponse(LedgerEntryResponseDto)
  async ledger(@Query() query: PartnerLedgerQueryDto): Promise<Paginated<LedgerEntryResponse>> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    const result = await this.listLedgerUseCase.execute(tenantId, partnerId, query);
    return toPaginated(query, result, toLedgerEntryResponse);
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
  @ApiPaginatedResponse(PayoutResponseDto)
  async payouts(@Query() query: PaginationQueryDto): Promise<Paginated<PayoutResponse>> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    const result = await this.listPayoutsUseCase.execute(tenantId, partnerId, query);
    return toPaginated(query, result, toPartnerPayoutResponse);
  }
}
