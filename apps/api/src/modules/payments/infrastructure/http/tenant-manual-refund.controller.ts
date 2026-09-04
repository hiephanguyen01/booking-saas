import type {
  ManualRefundDetailResponse,
  ManualRefundEvidenceUploadResponse,
  ManualRefundListQuery,
  ManualRefundListResponse,
  ManualRefundPrivateDetailsResponse,
} from '@booking/contracts';
import { Body, Controller, Get, Header, HttpCode, Ip, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { ListTenantManualRefundsUseCase } from '../../application/use-cases/list-tenant-manual-refunds.use-case';
import { GetTenantManualRefundUseCase } from '../../application/use-cases/get-tenant-manual-refund.use-case';
import { VerifyManualRefundDestinationUseCase } from '../../application/use-cases/verify-manual-refund-destination.use-case';
import { ClaimManualRefundUseCase } from '../../application/use-cases/claim-manual-refund.use-case';
import { ReassignManualRefundUseCase } from '../../application/use-cases/reassign-manual-refund.use-case';
import { CreateManualRefundEvidenceUploadUseCase } from '../../application/use-cases/create-manual-refund-evidence-upload.use-case';
import { SubmitManualRefundTransferUseCase } from '../../application/use-cases/submit-manual-refund-transfer.use-case';
import { RejectManualRefundUseCase } from '../../application/use-cases/reject-manual-refund.use-case';
import { ReopenManualRefundDestinationUseCase } from '../../application/use-cases/reopen-manual-refund-destination.use-case';
import { RevealManualRefundPrivateDetailsUseCase } from '../../application/use-cases/reveal-manual-refund-private-details.use-case';
import { ApproveManualRefundUseCase } from '../../application/use-cases/approve-manual-refund.use-case';
import {
  ApproveManualRefundDto,
  ClaimManualRefundDto,
  CreateManualRefundEvidenceUploadDto,
  ManualRefundDetailResponseDto,
  ManualRefundEvidenceUploadResponseDto,
  ManualRefundListQueryDto,
  ManualRefundPrivateDetailsResponseDto,
  ReassignManualRefundDto,
  RejectManualRefundDto,
  ReopenManualRefundDto,
  RevealManualRefundPrivateDetailsDto,
  SubmitManualRefundTransferDto,
  VerifyManualRefundDestinationDto,
} from './dto/payments.dto';

@ApiTags('tenant-manual-refunds')
@Controller('tenant/refunds')
export class TenantManualRefundController {
  constructor(
    private readonly list: ListTenantManualRefundsUseCase,
    private readonly detail: GetTenantManualRefundUseCase,
    private readonly verify: VerifyManualRefundDestinationUseCase,
    private readonly claim: ClaimManualRefundUseCase,
    private readonly reassign: ReassignManualRefundUseCase,
    private readonly createEvidence: CreateManualRefundEvidenceUploadUseCase,
    private readonly submit: SubmitManualRefundTransferUseCase,
    private readonly reject: RejectManualRefundUseCase,
    private readonly reopen: ReopenManualRefundDestinationUseCase,
    private readonly reveal: RevealManualRefundPrivateDetailsUseCase,
    private readonly approve: ApproveManualRefundUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.refunds.prepare')
  @Get()
  async listRefunds(@Query() query: ManualRefundListQueryDto): Promise<ManualRefundListResponse> {
    return this.list.execute(this.tenantContext.tenantIdOrThrow(), query as ManualRefundListQuery);
  }

  @RequirePermissions('tenant.refunds.prepare')
  @Get(':id')
  @UuidParam()
  @ApiOkResponse({ type: ManualRefundDetailResponseDto })
  async get(@Param('id') id: string): Promise<ManualRefundDetailResponse> {
    return this.detail.execute(this.tenantContext.tenantIdOrThrow(), id);
  }

  @RequirePermissions('tenant.refunds.prepare')
  @Post(':id/verify')
  @HttpCode(200)
  @UuidParam()
  async verifyDestination(
    @Param('id') id: string,
    @Body() input: VerifyManualRefundDestinationDto,
    @CurrentPrincipal() p: SessionPrincipal,
  ) {
    return this.verify.execute(this.tenantContext.tenantIdOrThrow(), id, input, p.userId);
  }

  @RequirePermissions('tenant.refunds.prepare')
  @Post(':id/claim')
  @HttpCode(200)
  @UuidParam()
  async claimRefund(
    @Param('id') id: string,
    @Body() input: ClaimManualRefundDto,
    @CurrentPrincipal() p: SessionPrincipal,
  ) {
    return this.claim.execute(this.tenantContext.tenantIdOrThrow(), id, input, p.userId);
  }

  @RequirePermissions('tenant.refunds.prepare')
  @Post(':id/reassign')
  @HttpCode(200)
  @UuidParam()
  async reassignRefund(
    @Param('id') id: string,
    @Body() input: ReassignManualRefundDto,
    @CurrentPrincipal() p: SessionPrincipal,
  ) {
    return this.reassign.execute(this.tenantContext.tenantIdOrThrow(), id, input, p.userId);
  }

  @RequirePermissions('tenant.refunds.prepare')
  @Post(':id/evidence-upload')
  @HttpCode(200)
  @UuidParam()
  @ApiOkResponse({ type: ManualRefundEvidenceUploadResponseDto })
  async evidenceUpload(
    @Param('id') id: string,
    @Body() input: CreateManualRefundEvidenceUploadDto,
    @CurrentPrincipal() p: SessionPrincipal,
  ): Promise<ManualRefundEvidenceUploadResponse> {
    return this.createEvidence.execute(this.tenantContext.tenantIdOrThrow(), id, input, p.userId);
  }

  @RequirePermissions('tenant.refunds.prepare')
  @Post(':id/transfer')
  @HttpCode(200)
  @UuidParam()
  async submitTransfer(
    @Param('id') id: string,
    @Body() input: SubmitManualRefundTransferDto,
    @CurrentPrincipal() p: SessionPrincipal,
  ) {
    return this.submit.execute(this.tenantContext.tenantIdOrThrow(), id, input, p.userId);
  }

  @RequirePermissions('tenant.refunds.reveal')
  @Post(':id/reveal')
  @HttpCode(200)
  @UuidParam()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ManualRefundPrivateDetailsResponseDto })
  async revealPrivateDetails(
    @Param('id') id: string,
    @Body() input: RevealManualRefundPrivateDetailsDto,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<ManualRefundPrivateDetailsResponse> {
    return this.reveal.execute(this.tenantContext.tenantIdOrThrow(), id, input, {
      userId: principal.userId,
      ip,
    });
  }

  @RequirePermissions('tenant.refunds.approve')
  @Post(':id/approve')
  @HttpCode(200)
  @UuidParam()
  async approveRefund(
    @Param('id') id: string,
    @Body() input: ApproveManualRefundDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ) {
    return this.approve.execute(this.tenantContext.tenantIdOrThrow(), id, input, principal.userId);
  }

  @RequirePermissions('tenant.refunds.approve')
  @Post(':id/reject')
  @HttpCode(200)
  @UuidParam()
  async rejectRefund(
    @Param('id') id: string,
    @Body() input: RejectManualRefundDto,
    @CurrentPrincipal() p: SessionPrincipal,
  ) {
    return this.reject.execute(this.tenantContext.tenantIdOrThrow(), id, input, p.userId);
  }

  @RequirePermissions('tenant.refunds.approve')
  @Post(':id/reopen')
  @HttpCode(200)
  @UuidParam()
  async reopenRefund(
    @Param('id') id: string,
    @Body() input: ReopenManualRefundDto,
    @CurrentPrincipal() p: SessionPrincipal,
  ) {
    return this.reopen.execute(this.tenantContext.tenantIdOrThrow(), id, input, p.userId);
  }
}
