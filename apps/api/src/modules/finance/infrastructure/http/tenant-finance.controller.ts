import {
  type BookingSettlementResponse,
  type CreateTaxDocumentUploadInput,
  uuidSchema,
  type CommissionRuleResponse,
  type LedgerEntryResponse,
  type Paginated,
  type PartnerFinanceResponse,
  type PayoutResponse,
  type TenantFinanceSummaryResponse,
  type TenantPayableResponse,
  type SettlementSummaryResponse,
  type PayoutPolicyDto as PayoutPolicyResponse,
  type PrepareTaxFilingInput,
  type SubmitTaxFilingInput,
  type RecordTaxRemittanceInput,
  type IssueTaxCertificateInput,
  type TaxFilingPeriodResponse,
  type TaxWithholdingCertificateResponse,
  type TaxDocumentUploadResponse,
  type TaxDocumentDownloadResponse,
  type VoidTaxCertificateInput,
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
  Put,
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
import { SettlementNotFound } from '../../domain/errors/finance-domain-errors';
import {
  toBookingSettlementResponse,
  toCommissionRuleResponse,
  toLedgerEntryResponse,
  toPartnerFinanceResponse,
  toPayoutResponse,
  toTenantFinanceSummaryResponse,
  toTenantPayableResponse,
  toSettlementSummaryResponse,
  toTaxFilingPeriodResponse,
  toTaxWithholdingCertificateResponse,
} from '../../application/finance.mapper';
import { CreateCommissionRuleUseCase } from '../../application/use-cases/create-commission-rule.use-case';
import { CreateTaxDocumentUploadUseCase } from '../../application/use-cases/create-tax-document-upload.use-case';
import { CreatePayoutUseCase } from '../../application/use-cases/create-payout.use-case';
import { DeleteCommissionRuleUseCase } from '../../application/use-cases/delete-commission-rule.use-case';
import { FailPayoutUseCase } from '../../application/use-cases/fail-payout.use-case';
import { GetPartnerFinanceUseCase } from '../../application/use-cases/get-partner-finance.use-case';
import { GetTenantFinanceSummaryUseCase } from '../../application/use-cases/get-tenant-finance-summary.use-case';
import { GetTenantPayableUseCase } from '../../application/use-cases/get-tenant-payable.use-case';
import { ListCommissionRulesUseCase } from '../../application/use-cases/list-commission-rules.use-case';
import { ListBookingSettlementsUseCase } from '../../application/use-cases/list-booking-settlements.use-case';
import { GetBookingSettlementUseCase } from '../../application/use-cases/get-booking-settlement.use-case';
import { GetSettlementSummaryUseCase } from '../../application/use-cases/get-settlement-summary.use-case';
import { GetTenantPayoutPolicyUseCase } from '../../application/use-cases/get-tenant-payout-policy.use-case';
import { UpdatePayoutPolicyUseCase } from '../../application/use-cases/update-payout-policy.use-case';
import { ListPayoutsUseCase } from '../../application/use-cases/list-payouts.use-case';
import { ListTenantLedgerUseCase } from '../../application/use-cases/list-tenant-ledger.use-case';
import { MarkPayoutPaidUseCase } from '../../application/use-cases/mark-payout-paid.use-case';
import { UpdateCommissionRuleUseCase } from '../../application/use-cases/update-commission-rule.use-case';
import { PrepareTaxFilingPeriodUseCase } from '../../application/use-cases/prepare-tax-filing-period.use-case';
import { ListTaxFilingPeriodsUseCase } from '../../application/use-cases/list-tax-filing-periods.use-case';
import { SubmitTaxFilingPeriodUseCase } from '../../application/use-cases/submit-tax-filing-period.use-case';
import { RecordTaxRemittanceUseCase } from '../../application/use-cases/record-tax-remittance.use-case';
import { IssueTaxWithholdingCertificateUseCase } from '../../application/use-cases/issue-tax-withholding-certificate.use-case';
import { ListTaxWithholdingCertificatesUseCase } from '../../application/use-cases/list-tax-withholding-certificates.use-case';
import { GetTaxDocumentDownloadUseCase } from '../../application/use-cases/get-tax-document-download.use-case';
import { VoidTaxWithholdingCertificateUseCase } from '../../application/use-cases/void-tax-withholding-certificate.use-case';
import {
  BookingSettlementResponseDto,
  BookingSettlementsQueryDto,
  CommissionRuleResponseDto,
  CreateCommissionRuleDto,
  CreatePayoutDto,
  CreateTaxDocumentUploadDto,
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
  SettlementSummaryResponseDto,
  PayoutPolicyDto,
  PrepareTaxFilingDto,
  SubmitTaxFilingDto,
  RecordTaxRemittanceDto,
  IssueTaxCertificateDto,
  TaxFilingPeriodResponseDto,
  TaxDocumentUploadResponseDto,
  TaxWithholdingCertificateResponseDto,
  TaxDocumentDownloadResponseDto,
  VoidTaxCertificateDto,
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
    private readonly listSettlementsUseCase: ListBookingSettlementsUseCase,
    private readonly getSettlementUseCase: GetBookingSettlementUseCase,
    private readonly getSettlementSummaryUseCase: GetSettlementSummaryUseCase,
    private readonly getPayoutPolicyUseCase: GetTenantPayoutPolicyUseCase,
    private readonly updatePayoutPolicyUseCase: UpdatePayoutPolicyUseCase,
    private readonly createTaxDocumentUploadUseCase: CreateTaxDocumentUploadUseCase,
    private readonly prepareTaxFilingUseCase: PrepareTaxFilingPeriodUseCase,
    private readonly listTaxFilingsUseCase: ListTaxFilingPeriodsUseCase,
    private readonly submitTaxFilingUseCase: SubmitTaxFilingPeriodUseCase,
    private readonly recordTaxRemittanceUseCase: RecordTaxRemittanceUseCase,
    private readonly issueTaxCertificateUseCase: IssueTaxWithholdingCertificateUseCase,
    private readonly listTaxCertificatesUseCase: ListTaxWithholdingCertificatesUseCase,
    private readonly getTaxDocumentDownloadUseCase: GetTaxDocumentDownloadUseCase,
    private readonly voidTaxCertificateUseCase: VoidTaxWithholdingCertificateUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get tenantId(): string {
    return this.tenantContext.tenantIdOrThrow();
  }

  @RequirePermissions('tenant.finance.read')
  @Get('payout-policy')
  @ApiOperation({ summary: 'Read the tenant dispute and payout policy' })
  @ApiOkResponse({ type: PayoutPolicyDto })
  payoutPolicy(): Promise<PayoutPolicyResponse> {
    return this.getPayoutPolicyUseCase.execute(this.tenantId);
  }

  @RequirePermissions('tenant.payouts.manage')
  @Put('payout-policy')
  @ApiOperation({ summary: 'Update the tenant dispute and payout policy' })
  @ApiOkResponse({ type: PayoutPolicyDto })
  updatePayoutPolicy(@Body() input: PayoutPolicyDto): Promise<PayoutPolicyResponse> {
    return this.updatePayoutPolicyUseCase.execute(this.tenantId, input);
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
  @ApiOperation({
    summary: 'List tenant ledger entries',
    description: 'Filterable by booking, owner type, entry type and created-at range.',
  })
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
  @Get('settlements')
  @ApiOperation({
    summary: 'List customer-payment settlements',
    description:
      'Shows money held by the tenant, the dispute deadline, recognized earnings and the amount payable to the partner.',
  })
  @ApiPaginatedResponse(BookingSettlementResponseDto)
  async settlements(
    @Query() query: BookingSettlementsQueryDto,
  ): Promise<Paginated<BookingSettlementResponse>> {
    const result = await this.listSettlementsUseCase.execute(this.tenantId, query);
    return toPaginated(query, result, toBookingSettlementResponse);
  }

  @RequirePermissions('tenant.finance.read')
  @Get('settlement-summary')
  @ApiOperation({ summary: 'Aggregate custody, dispute and payout settlement totals' })
  @ApiOkResponse({ type: SettlementSummaryResponseDto })
  async settlementSummary(
    @Query('partnerId', new ZodValidationPipe(uuidSchema.optional())) partnerId?: string,
  ): Promise<SettlementSummaryResponse> {
    return toSettlementSummaryResponse(
      await this.getSettlementSummaryUseCase.execute(this.tenantId, partnerId),
    );
  }

  @RequirePermissions('tenant.finance.read')
  @Get('settlements/:bookingId')
  @UuidParam('bookingId')
  @ApiOperation({ summary: 'Get the settlement state for one booking' })
  @ApiOkResponse({ type: BookingSettlementResponseDto })
  async settlement(
    @Param('bookingId', new ZodValidationPipe(uuidSchema)) bookingId: string,
  ): Promise<BookingSettlementResponse> {
    const view = await this.getSettlementUseCase.execute(this.tenantId, bookingId);
    if (!view) {
      throw new SettlementNotFound();
    }
    return toBookingSettlementResponse(view.settlement, view.taxPosition);
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

  // ── Tax operations ───────────────────────────────────────────────────────

  @RequirePermissions('tenant.payouts.manage')
  @Post('tax/documents/presign')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mint a private PDF upload grant for tenant tax documents' })
  @ApiOkResponse({ type: TaxDocumentUploadResponseDto })
  async createTaxDocumentUpload(
    @Body() input: CreateTaxDocumentUploadDto,
  ): Promise<TaxDocumentUploadResponse> {
    const value: CreateTaxDocumentUploadInput = input;
    return this.createTaxDocumentUploadUseCase.execute(this.tenantId, value);
  }

  @RequirePermissions('tenant.finance.read')
  @Get('tax/filings')
  @ApiOperation({ summary: 'List monthly partner-tax filing periods' })
  @ApiOkResponse({ type: [TaxFilingPeriodResponseDto] })
  async taxFilings(): Promise<TaxFilingPeriodResponse[]> {
    return (await this.listTaxFilingsUseCase.execute(this.tenantId)).map(toTaxFilingPeriodResponse);
  }

  @RequirePermissions('tenant.payouts.manage')
  @Post('tax/filings/prepare')
  @ApiOperation({ summary: 'Prepare or refresh a draft monthly tax filing' })
  @ApiOkResponse({ type: TaxFilingPeriodResponseDto })
  async prepareTaxFiling(
    @Body() input: PrepareTaxFilingDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<TaxFilingPeriodResponse> {
    const value: PrepareTaxFilingInput = input;
    return toTaxFilingPeriodResponse(
      await this.prepareTaxFilingUseCase.execute(
        this.tenantId,
        value.taxYear,
        value.taxMonth,
        principal.userId,
      ),
    );
  }

  @RequirePermissions('tenant.payouts.manage')
  @Post('tax/filings/:id/submit')
  @UuidParam()
  @ApiOperation({ summary: 'Record submission of a monthly tax filing' })
  @ApiOkResponse({ type: TaxFilingPeriodResponseDto })
  async submitTaxFiling(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: SubmitTaxFilingDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<TaxFilingPeriodResponse> {
    const value: SubmitTaxFilingInput = input;
    return toTaxFilingPeriodResponse(
      await this.submitTaxFilingUseCase.execute(
        this.tenantId,
        id,
        value.submissionReference,
        principal.userId,
      ),
    );
  }

  @RequirePermissions('tenant.payouts.manage')
  @Post('tax/filings/:id/remittances')
  @UuidParam()
  @ApiOperation({ summary: 'Record tax remittance and settle the authority liability' })
  @ApiOkResponse({ type: TaxFilingPeriodResponseDto })
  async recordTaxRemittance(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: RecordTaxRemittanceDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<TaxFilingPeriodResponse> {
    const value: RecordTaxRemittanceInput = input;
    return toTaxFilingPeriodResponse(
      await this.recordTaxRemittanceUseCase.execute(
        this.tenantId,
        id,
        {
          vatAmount: BigInt(value.vatAmount),
          pitAmount: BigInt(value.pitAmount),
          paymentReference: value.paymentReference,
          paidAt: new Date(value.paidAt),
          evidence: value.evidence,
        },
        principal.userId,
      ),
    );
  }

  @RequirePermissions('tenant.finance.read')
  @Get('tax/certificates')
  @ApiOperation({ summary: 'List annual partner withholding certificates' })
  @ApiOkResponse({ type: [TaxWithholdingCertificateResponseDto] })
  async taxCertificates(
    @Query('partnerId', new ZodValidationPipe(uuidSchema.optional())) partnerId?: string,
  ): Promise<TaxWithholdingCertificateResponse[]> {
    return (await this.listTaxCertificatesUseCase.execute(this.tenantId, partnerId)).map(
      toTaxWithholdingCertificateResponse,
    );
  }

  @RequirePermissions('tenant.finance.read')
  @Get('tax/certificates/:id/download')
  @UuidParam()
  @ApiOperation({ summary: 'Create a short-lived private download for a tax certificate' })
  @ApiOkResponse({ type: TaxDocumentDownloadResponseDto })
  taxCertificateDownload(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<TaxDocumentDownloadResponse> {
    return this.getTaxDocumentDownloadUseCase.execute(this.tenantId, id, {
      actorId: principal.userId,
      actorType: 'tenant',
    });
  }

  @RequirePermissions('tenant.payouts.manage')
  @Post('tax/certificates')
  @ApiOperation({ summary: 'Issue annual withholding certificate metadata' })
  @ApiCreatedResponse({ type: TaxWithholdingCertificateResponseDto })
  async issueTaxCertificate(
    @Body() input: IssueTaxCertificateDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<TaxWithholdingCertificateResponse> {
    const value: IssueTaxCertificateInput = input;
    return toTaxWithholdingCertificateResponse(
      await this.issueTaxCertificateUseCase.execute(
        this.tenantId,
        value.partnerId,
        value.taxYear,
        {
          certificateNumber: value.certificateNumber,
          fileKey: value.fileKey,
        },
        principal.userId,
      ),
    );
  }

  @RequirePermissions('tenant.payouts.manage')
  @Post('tax/certificates/:id/void')
  @UuidParam()
  @ApiOperation({ summary: 'Void an active withholding certificate before replacement' })
  @ApiOkResponse({ type: TaxWithholdingCertificateResponseDto })
  async voidTaxCertificate(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: VoidTaxCertificateDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<TaxWithholdingCertificateResponse> {
    const value: VoidTaxCertificateInput = input;
    return toTaxWithholdingCertificateResponse(
      await this.voidTaxCertificateUseCase.execute(
        this.tenantId,
        id,
        value.reason,
        principal.userId,
      ),
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
