import {
  uuidSchema,
  type CommissionRuleResponse,
  type LedgerEntryResponse,
  type Paginated,
  type PartnerFinanceResponse,
  type PayoutResponse,
  type TenantFinanceSummaryResponse,
  type TenantPayableResponse,
} from '@booking/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPaginatedResponse, UuidParam } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { PaginationQueryDto } from '../../../../shared/pagination/pagination.dto';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import {
  toCommissionRuleResponse,
  toLedgerEntryResponse,
  toPartnerFinanceResponse,
  toPayoutResponse,
  toTenantFinanceSummaryResponse,
  toTenantPayableResponse,
} from '../../application/finance.mapper';
import { CreateCommissionRuleUseCase } from '../../application/use-cases/create-commission-rule.use-case';
import { CreatePayoutUseCase } from '../../application/use-cases/create-payout.use-case';
import { DeleteCommissionRuleUseCase } from '../../application/use-cases/delete-commission-rule.use-case';
import { FailPayoutUseCase } from '../../application/use-cases/fail-payout.use-case';
import { GetPartnerFinanceUseCase } from '../../application/use-cases/get-partner-finance.use-case';
import { GetTenantFinanceSummaryUseCase } from '../../application/use-cases/get-tenant-finance-summary.use-case';
import { GetTenantPayableUseCase } from '../../application/use-cases/get-tenant-payable.use-case';
import { ListCommissionRulesUseCase } from '../../application/use-cases/list-commission-rules.use-case';
import { ListPayoutsUseCase } from '../../application/use-cases/list-payouts.use-case';
import { ListTenantLedgerUseCase } from '../../application/use-cases/list-tenant-ledger.use-case';
import { MarkPayoutPaidUseCase } from '../../application/use-cases/mark-payout-paid.use-case';
import { UpdateCommissionRuleUseCase } from '../../application/use-cases/update-commission-rule.use-case';
import {
  CommissionRuleResponseDto,
  CreateCommissionRuleDto,
  CreatePayoutDto,
  FailPayoutDto,
  LedgerEntryResponseDto,
  LedgerQueryDto,
  MarkPayoutPaidDto,
  PartnerFinanceResponseDto,
  PayoutResponseDto,
  TenantFinanceSummaryResponseDto,
  TenantPayableQueryDto,
  TenantPayableResponseDto,
  UpdateCommissionRuleDto,
} from './dto/finance.dto';

/** Tenant finance: commission rules, ledger overview + manual payouts (§13.3). */
@ApiTags('tenant-finance')
@Controller('tenant/finance')
export class TenantFinanceController {
  constructor(
    private readonly listRulesUseCase: ListCommissionRulesUseCase,
    private readonly createRuleUseCase: CreateCommissionRuleUseCase,
    private readonly updateRuleUseCase: UpdateCommissionRuleUseCase,
    private readonly deleteRuleUseCase: DeleteCommissionRuleUseCase,
    private readonly listPayoutsUseCase: ListPayoutsUseCase,
    private readonly createPayoutUseCase: CreatePayoutUseCase,
    private readonly markPayoutPaidUseCase: MarkPayoutPaidUseCase,
    private readonly failPayoutUseCase: FailPayoutUseCase,
    private readonly summaryUseCase: GetTenantFinanceSummaryUseCase,
    private readonly partnerFinanceUseCase: GetPartnerFinanceUseCase,
    private readonly listLedgerUseCase: ListTenantLedgerUseCase,
    private readonly getPayableUseCase: GetTenantPayableUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get tenantId(): string {
    return this.tenantContext.tenantIdOrThrow();
  }

  // ── Commission rules ──────────────────────────────────────────────────────

  @RequirePermissions('tenant.commissions.manage')
  @Get('commission-rules')
  @ApiOperation({ summary: 'List commission rules' })
  @ApiOkResponse({ type: [CommissionRuleResponseDto] })
  async listRules(): Promise<CommissionRuleResponse[]> {
    return (await this.listRulesUseCase.execute(this.tenantId)).map(toCommissionRuleResponse);
  }

  @RequirePermissions('tenant.commissions.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post('commission-rules')
  @ApiOperation({ summary: 'Create a commission rule' })
  @ApiCreatedResponse({ type: CommissionRuleResponseDto })
  async createRule(@Body() input: CreateCommissionRuleDto): Promise<CommissionRuleResponse> {
    return toCommissionRuleResponse(await this.createRuleUseCase.execute(this.tenantId, input));
  }

  @RequirePermissions('tenant.commissions.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch('commission-rules/:id')
  @ApiOperation({ summary: 'Update a commission rule' })
  @UuidParam()
  @ApiOkResponse({ type: CommissionRuleResponseDto })
  async updateRule(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: UpdateCommissionRuleDto,
  ): Promise<CommissionRuleResponse> {
    return toCommissionRuleResponse(await this.updateRuleUseCase.execute(this.tenantId, id, input));
  }

  @RequirePermissions('tenant.commissions.manage')
  @Delete('commission-rules/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a commission rule' })
  @UuidParam()
  @ApiNoContentResponse()
  async deleteRule(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    await this.deleteRuleUseCase.execute(this.tenantId, id);
  }

  // ── Ledger overview ───────────────────────────────────────────────────────

  @RequirePermissions('tenant.finance.read')
  @Get('summary')
  @ApiOperation({ summary: 'Tenant finance overview' })
  @ApiOkResponse({ type: TenantFinanceSummaryResponseDto })
  async summary(): Promise<TenantFinanceSummaryResponse> {
    return toTenantFinanceSummaryResponse(await this.summaryUseCase.execute(this.tenantId));
  }

  @RequirePermissions('tenant.finance.read')
  @Get('ledger')
  @ApiOperation({ summary: 'List tenant ledger entries', description: 'Filterable by booking, owner type, entry type and created-at range.' })
  @ApiPaginatedResponse(LedgerEntryResponseDto)
  async ledger(@Query() query: LedgerQueryDto): Promise<Paginated<LedgerEntryResponse>> {
    const { items, total } = await this.listLedgerUseCase.execute(this.tenantId, query);
    return {
      items: items.map(toLedgerEntryResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  @RequirePermissions('tenant.finance.read')
  @Get('partners/:partnerId')
  @ApiOperation({ summary: "A partner's balance + ledger history" })
  @UuidParam('partnerId')
  @ApiOkResponse({ type: PartnerFinanceResponseDto })
  async partner(
    @Param('partnerId', new ZodValidationPipe(uuidSchema)) partnerId: string,
  ): Promise<PartnerFinanceResponse> {
    return toPartnerFinanceResponse(
      await this.partnerFinanceUseCase.execute(this.tenantId, partnerId),
    );
  }

  // ── Payouts ───────────────────────────────────────────────────────────────

  @RequirePermissions('tenant.payouts.manage')
  @Get('payable')
  @ApiOperation({
    summary: 'Preview what a payout run would pay a payee',
    description:
      "The payable a run actually pays (maturePayable − outstanding), plus the policy inputs behind it. This — not the payee's raw ledger balance — is the amount to show before opening a run; `eligible`/`ineligibleReason` mirror the codes POST payouts would reject with.",
  })
  @ApiOkResponse({ type: TenantPayableResponseDto })
  async payable(@Query() query: TenantPayableQueryDto): Promise<TenantPayableResponse> {
    return toTenantPayableResponse(await this.getPayableUseCase.execute(this.tenantId, query));
  }

  @RequirePermissions('tenant.payouts.manage')
  @Get('payouts')
  @ApiOperation({ summary: 'List payouts' })
  @ApiPaginatedResponse(PayoutResponseDto)
  async listPayouts(@Query() query: PaginationQueryDto): Promise<Paginated<PayoutResponse>> {
    const result = await this.listPayoutsUseCase.execute(this.tenantId, query);
    return toPaginated(query, result, toPayoutResponse);
  }

  @RequirePermissions('tenant.payouts.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post('payouts')
  @ApiOperation({ summary: 'Create a payout run' })
  @ApiCreatedResponse({ type: PayoutResponseDto })
  async createPayout(
    @Body() input: CreatePayoutDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PayoutResponse> {
    return toPayoutResponse(
      await this.createPayoutUseCase.execute(this.tenantId, input, principal.userId),
    );
  }

  @RequirePermissions('tenant.payouts.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post('payouts/:id/mark-paid')
  @ApiOperation({ summary: 'Mark a payout as paid' })
  @UuidParam()
  @ApiCreatedResponse({ type: PayoutResponseDto })
  async markPaid(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: MarkPayoutPaidDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PayoutResponse> {
    return toPayoutResponse(
      await this.markPayoutPaidUseCase.execute(this.tenantId, id, input, principal.userId),
    );
  }

  @RequirePermissions('tenant.payouts.manage')
  @Post('payouts/:id/fail')
  @ApiOperation({ summary: 'Mark a payout as failed' })
  @UuidParam()
  @ApiCreatedResponse({ type: PayoutResponseDto })
  async failPayout(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: FailPayoutDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PayoutResponse> {
    return toPayoutResponse(
      await this.failPayoutUseCase.execute(
        this.tenantId,
        id,
        input.reason ?? null,
        principal.userId,
      ),
    );
  }
}
