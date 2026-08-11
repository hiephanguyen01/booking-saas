import type {
  PartnerBookingSettlementResponse,
  LedgerEntryResponse,
  Paginated,
  PartnerFinanceResponse,
  PartnerSettlementDisputeResponse,
  PayoutResponse,
  SettlementSummaryResponse,
  PartnerTaxWithholdingCertificateResponse,
  TaxDocumentDownloadResponse,
} from '@booking/contracts';
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { ApiPaginatedResponse, UuidParam } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { PaginationQueryDto } from '../../../../shared/pagination/pagination.dto';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireCurrentAgreementGuard } from '../../../legal/infrastructure/http/guards/require-current-agreement.guard';
import { SettlementNotFound } from '../../domain/errors/finance-domain-errors';
import {
  toPartnerBookingSettlementResponse,
  toLedgerEntryResponse,
  toPartnerFinanceResponse,
  toPartnerPayoutResponse,
  toPartnerSettlementDisputeResponse,
  toSettlementSummaryResponse,
  toPartnerTaxWithholdingCertificateResponse,
} from '../../application/finance.mapper';
import { GetPartnerFinanceUseCase } from '../../application/use-cases/get-partner-finance.use-case';
import { GetBookingSettlementUseCase } from '../../application/use-cases/get-booking-settlement.use-case';
import { ListPartnerLedgerUseCase } from '../../application/use-cases/list-partner-ledger.use-case';
import { ListPartnerPayoutsUseCase } from '../../application/use-cases/list-partner-payouts.use-case';
import { ListBookingSettlementsUseCase } from '../../application/use-cases/list-booking-settlements.use-case';
import { ListSettlementDisputesUseCase } from '../../application/use-cases/list-settlement-disputes.use-case';
import { RespondSettlementDisputeUseCase } from '../../application/use-cases/respond-settlement-dispute.use-case';
import { GetSettlementSummaryUseCase } from '../../application/use-cases/get-settlement-summary.use-case';
import { ListTaxWithholdingCertificatesUseCase } from '../../application/use-cases/list-tax-withholding-certificates.use-case';
import { GetTaxDocumentDownloadUseCase } from '../../application/use-cases/get-tax-document-download.use-case';
import {
  PartnerBookingSettlementResponseDto,
  LedgerEntryResponseDto,
  PartnerFinanceResponseDto,
  PartnerLedgerQueryDto,
  PayoutResponseDto,
  BookingSettlementsQueryDto,
  PartnerSettlementDisputeResponseDto,
  PartnerSettlementDisputesQueryDto,
  RespondSettlementDisputeDto,
  SettlementSummaryResponseDto,
  PartnerTaxWithholdingCertificateResponseDto,
  TaxDocumentDownloadResponseDto,
} from './dto/finance.dto';

/** Partner self-service finance (§13.3): current balance + ledger history. */
@ApiTags('partner-finance')
@Controller('partner/finance')
export class PartnerFinanceController {
  constructor(
    private readonly partnerFinanceUseCase: GetPartnerFinanceUseCase,
    private readonly listLedgerUseCase: ListPartnerLedgerUseCase,
    private readonly listPayoutsUseCase: ListPartnerPayoutsUseCase,
    private readonly getSettlementUseCase: GetBookingSettlementUseCase,
    private readonly listSettlementsUseCase: ListBookingSettlementsUseCase,
    private readonly listDisputesUseCase: ListSettlementDisputesUseCase,
    private readonly respondDisputeUseCase: RespondSettlementDisputeUseCase,
    private readonly getSettlementSummaryUseCase: GetSettlementSummaryUseCase,
    private readonly listTaxCertificatesUseCase: ListTaxWithholdingCertificatesUseCase,
    private readonly getTaxDocumentDownloadUseCase: GetTaxDocumentDownloadUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.finance.read')
  @Get('tax/certificates')
  @ApiOperation({ summary: 'List the partner own annual withholding certificates' })
  @ApiOkResponse({ type: [PartnerTaxWithholdingCertificateResponseDto] })
  async taxCertificates(): Promise<PartnerTaxWithholdingCertificateResponse[]> {
    const certificates = await this.listTaxCertificatesUseCase.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
    );
    const visible: PartnerTaxWithholdingCertificateResponse[] = [];
    for (const certificate of certificates) {
      if (certificate.status !== 'draft') {
        visible.push(toPartnerTaxWithholdingCertificateResponse(certificate));
      }
    }
    return visible;
  }

  @RequirePermissions('partner.finance.read')
  @Get('tax/certificates/:id/download')
  @UuidParam()
  @ApiOperation({ summary: 'Create a short-lived download for an owned tax certificate' })
  @ApiOkResponse({ type: TaxDocumentDownloadResponseDto })
  taxCertificateDownload(
    @Param('id') id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<TaxDocumentDownloadResponse> {
    return this.getTaxDocumentDownloadUseCase.execute(this.tenantContext.tenantIdOrThrow(), id, {
      actorId: principal.userId,
      actorType: 'partner',
      partnerId: this.tenantContext.partnerIdOrThrow(),
    });
  }

  @RequirePermissions('partner.disputes.read')
  @Get('settlement-summary')
  @ApiOperation({ summary: 'Summarize the partner own settlement and payout states' })
  @ApiOkResponse({ type: SettlementSummaryResponseDto })
  async settlementSummary(): Promise<SettlementSummaryResponse> {
    return toSettlementSummaryResponse(
      await this.getSettlementSummaryUseCase.execute(
        this.tenantContext.tenantIdOrThrow(),
        this.tenantContext.partnerIdOrThrow(),
      ),
    );
  }

  @RequirePermissions('partner.finance.read')
  @Get('disputes')
  @ApiOperation({ summary: 'List disputes affecting the partner own bookings' })
  @ApiPaginatedResponse(PartnerSettlementDisputeResponseDto)
  async disputes(
    @Query() query: PartnerSettlementDisputesQueryDto,
  ): Promise<Paginated<PartnerSettlementDisputeResponse>> {
    const result = await this.listDisputesUseCase.execute(
      this.tenantContext.tenantIdOrThrow(),
      query,
      this.tenantContext.partnerIdOrThrow(),
    );
    return toPaginated(query, result, toPartnerSettlementDisputeResponse);
  }

  @RequirePermissions('partner.disputes.respond')
  @UseGuards(RequireCurrentAgreementGuard)
  @Post('disputes/:id/respond')
  @UuidParam('id')
  @ApiOperation({ summary: 'Respond once to an open dispute affecting an owned booking' })
  @ApiCreatedResponse({ type: PartnerSettlementDisputeResponseDto })
  async respondToDispute(
    @Param('id') id: string,
    @Body() input: RespondSettlementDisputeDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PartnerSettlementDisputeResponse> {
    return toPartnerSettlementDisputeResponse(
      await this.respondDisputeUseCase.execute(
        this.tenantContext.tenantIdOrThrow(),
        id,
        this.tenantContext.partnerIdOrThrow(),
        principal.userId,
        input,
      ),
    );
  }

  @RequirePermissions('partner.finance.read')
  @Get('settlements')
  @ApiOperation({ summary: 'List the partner own settlement states' })
  @ApiPaginatedResponse(PartnerBookingSettlementResponseDto)
  async settlements(
    @Query() query: BookingSettlementsQueryDto,
  ): Promise<Paginated<PartnerBookingSettlementResponse>> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    const result = await this.listSettlementsUseCase.execute(tenantId, { ...query, partnerId });
    return toPaginated(query, result, toPartnerBookingSettlementResponse);
  }

  @RequirePermissions('partner.finance.read')
  @Get()
  @ApiOperation({ summary: 'Partner current balance + recent ledger preview' })
  @ApiOkResponse({ type: PartnerFinanceResponseDto })
  async finance(): Promise<PartnerFinanceResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerFinanceResponse(await this.partnerFinanceUseCase.execute(tenantId, partnerId));
  }

  @RequirePermissions('partner.finance.read')
  @Get('settlements/:bookingId')
  @UuidParam('bookingId')
  @ApiOperation({ summary: 'Get the settlement state for one owned booking' })
  @ApiOkResponse({ type: PartnerBookingSettlementResponseDto })
  async settlement(
    @Param('bookingId') bookingId: string,
  ): Promise<PartnerBookingSettlementResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    const settlement = await this.getSettlementUseCase.execute(tenantId, bookingId, partnerId);
    if (!settlement) {
      throw new SettlementNotFound();
    }
    return toPartnerBookingSettlementResponse(settlement);
  }

  /**
   * The partner's full ledger journal, paginated + filterable — the complete
   * history behind the balance preview on `GET /partner/finance`. Owner is forced
   * to the partner in scope, so a partner only ever reads its own entries.
   */
  @RequirePermissions('partner.finance.read')
  @Get('ledger')
  @ApiOperation({
    summary: 'Partner ledger history (paginated, filter by entry type + date range)',
  })
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
