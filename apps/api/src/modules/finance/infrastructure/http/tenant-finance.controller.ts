import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createCommissionRuleInputSchema,
  createPayoutInputSchema,
  failPayoutInputSchema,
  markPayoutPaidInputSchema,
  paginationQuerySchema,
  updateCommissionRuleInputSchema,
  uuidSchema,
  type CommissionRuleResponse,
  type CreateCommissionRuleInput,
  type CreatePayoutInput,
  type FailPayoutInput,
  type LedgerEntryResponse,
  type MarkPayoutPaidInput,
  type Paginated,
  type PaginationQuery,
  type PartnerFinanceResponse,
  type PayoutResponse,
  type TenantFinanceSummaryResponse,
  type UpdateCommissionRuleInput,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { ListCommissionRulesUseCase } from '../../application/use-cases/list-commission-rules.use-case';
import { CreateCommissionRuleUseCase } from '../../application/use-cases/create-commission-rule.use-case';
import { UpdateCommissionRuleUseCase } from '../../application/use-cases/update-commission-rule.use-case';
import { DeleteCommissionRuleUseCase } from '../../application/use-cases/delete-commission-rule.use-case';
import { ListPayoutsUseCase } from '../../application/use-cases/list-payouts.use-case';
import { CreatePayoutUseCase } from '../../application/use-cases/create-payout.use-case';
import { MarkPayoutPaidUseCase } from '../../application/use-cases/mark-payout-paid.use-case';
import { FailPayoutUseCase } from '../../application/use-cases/fail-payout.use-case';
import { GetTenantFinanceSummaryUseCase } from '../../application/use-cases/get-tenant-finance-summary.use-case';
import { GetPartnerFinanceUseCase } from '../../application/use-cases/get-partner-finance.use-case';
import { ListTenantLedgerUseCase } from '../../application/use-cases/list-tenant-ledger.use-case';
import {
  toCommissionRuleResponse,
  toLedgerEntryResponse,
  toPartnerFinanceResponse,
  toPayoutResponse,
  toTenantFinanceSummaryResponse,
} from '../../application/finance.mapper';

/** Tenant finance: commission rules, ledger overview + manual payouts (§13.3). */
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
    private readonly tenantContext: TenantContextService,
  ) {}

  private get tenantId(): string {
    return this.tenantContext.tenantIdOrThrow();
  }

  // ── Commission rules ──────────────────────────────────────────────────────

  @RequirePermissions('tenant.commissions.manage')
  @Get('commission-rules')
  async listRules(): Promise<CommissionRuleResponse[]> {
    return (await this.listRulesUseCase.execute(this.tenantId)).map(toCommissionRuleResponse);
  }

  @RequirePermissions('tenant.commissions.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post('commission-rules')
  async createRule(
    @Body(new ZodValidationPipe(createCommissionRuleInputSchema)) input: CreateCommissionRuleInput,
  ): Promise<CommissionRuleResponse> {
    return toCommissionRuleResponse(await this.createRuleUseCase.execute(this.tenantId, input));
  }

  @RequirePermissions('tenant.commissions.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch('commission-rules/:id')
  async updateRule(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateCommissionRuleInputSchema)) input: UpdateCommissionRuleInput,
  ): Promise<CommissionRuleResponse> {
    return toCommissionRuleResponse(await this.updateRuleUseCase.execute(this.tenantId, id, input));
  }

  @RequirePermissions('tenant.commissions.manage')
  @Delete('commission-rules/:id')
  @HttpCode(204)
  async deleteRule(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    await this.deleteRuleUseCase.execute(this.tenantId, id);
  }

  // ── Ledger overview ───────────────────────────────────────────────────────

  @RequirePermissions('tenant.finance.read')
  @Get('summary')
  async summary(): Promise<TenantFinanceSummaryResponse> {
    return toTenantFinanceSummaryResponse(await this.summaryUseCase.execute(this.tenantId));
  }

  @RequirePermissions('tenant.finance.read')
  @Get('ledger')
  async ledger(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<LedgerEntryResponse>> {
    const { items, total } = await this.listLedgerUseCase.execute(this.tenantId, query);
    return { items: items.map(toLedgerEntryResponse), page: query.page, pageSize: query.pageSize, total };
  }

  @RequirePermissions('tenant.finance.read')
  @Get('partners/:partnerId')
  async partner(
    @Param('partnerId', new ZodValidationPipe(uuidSchema)) partnerId: string,
  ): Promise<PartnerFinanceResponse> {
    return toPartnerFinanceResponse(await this.partnerFinanceUseCase.execute(this.tenantId, partnerId));
  }

  // ── Payouts ───────────────────────────────────────────────────────────────

  @RequirePermissions('tenant.payouts.manage')
  @Get('payouts')
  async listPayouts(): Promise<PayoutResponse[]> {
    return (await this.listPayoutsUseCase.execute(this.tenantId)).map(toPayoutResponse);
  }

  @RequirePermissions('tenant.payouts.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post('payouts')
  async createPayout(
    @Body(new ZodValidationPipe(createPayoutInputSchema)) input: CreatePayoutInput,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PayoutResponse> {
    return toPayoutResponse(await this.createPayoutUseCase.execute(this.tenantId, input, principal.userId));
  }

  @RequirePermissions('tenant.payouts.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post('payouts/:id/mark-paid')
  async markPaid(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(markPayoutPaidInputSchema)) input: MarkPayoutPaidInput,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PayoutResponse> {
    return toPayoutResponse(await this.markPayoutPaidUseCase.execute(this.tenantId, id, input, principal.userId));
  }

  @RequirePermissions('tenant.payouts.manage')
  @Post('payouts/:id/fail')
  async failPayout(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(failPayoutInputSchema)) input: FailPayoutInput,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PayoutResponse> {
    return toPayoutResponse(await this.failPayoutUseCase.execute(this.tenantId, id, input.reason ?? null, principal.userId));
  }
}
