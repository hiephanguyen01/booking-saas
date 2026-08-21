import type {
  PartnerAgreementResponse,
  PartnerResponse,
  PartnerTaxAssessmentResponse,
  PrivateDocumentUploadResponse,
} from '@booking/contracts';
import { Body, Controller, Get, HttpCode, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_UPLOAD } from '../../../../shared/http/throttle-limits';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequireCurrentAgreementGuard } from '../../../legal/infrastructure/http/guards/require-current-agreement.guard';
import { ListPartnerAcceptancesUseCase } from '../../../legal/application/use-cases/list-partner-acceptances.use-case';
import { toPartnerResponse } from '../../application/partner.mapper';
import { CreatePartnerDocumentUploadUseCase } from '../../application/use-cases/create-partner-document-upload.use-case';
import { GetPartnerProfileUseCase } from '../../application/use-cases/get-partner-profile.use-case';
import { SetPartnerDefaultCancellationPolicyUseCase } from '../../application/use-cases/set-partner-default-cancellation-policy.use-case';
import { SubmitIdentityUseCase } from '../../application/use-cases/submit-identity.use-case';
import { UpdatePartnerDocumentsUseCase } from '../../application/use-cases/update-partner-documents.use-case';
import { UpdatePayoutInfoUseCase } from '../../application/use-cases/update-payout-info.use-case';
import { GetPartnerTaxAssessmentUseCase } from '../../application/use-cases/get-partner-tax-assessment.use-case';
import { RecordPartnerTaxDeclarationUseCase } from '../../application/use-cases/record-partner-tax-declaration.use-case';
import { toPartnerTaxAssessmentResponse } from '../../application/partner-tax.mapper';
import {
  PartnerResponseDto,
  PartnerTaxAssessmentResponseDto,
  PartnerTaxYearQueryDto,
  RecordPartnerTaxDeclarationDto,
  PartnerAgreementListResponseDto,
  PartnerDocumentUploadDto,
  PrivateDocumentUploadResponseDto,
  SetDefaultCancellationPolicyDto,
  SubmitIdentityDto,
  UpdatePartnerDocumentsDto,
  UpdatePayoutInfoDto,
} from './dto/partner.dto';

/** Partner self-service (§7.3) — the partner reads its own record, sets payout
 *  details + submits ID. Scope via x-tenant-id + x-partner-id; the
 *  PermissionsGuard verifies the caller holds a role assignment on that partner,
 *  so every route here is inherently own-record-only.
 *
 *  Write routes additionally carry `RequireCurrentAgreementGuard`: a partner
 *  whose tenant has published new/updated terms since the partner last accepted
 *  is blocked from writing (payout, documents, identity, cancellation policy)
 *  until they re-accept via `POST /me/legal/accept`. Read routes (`profile`,
 *  `agreements`) stay open so a blocked partner can still see their own data —
 *  the dashboard redirect alone is not enforcement, since any caller that skips
 *  the UI would otherwise proceed unsigned. */
@ApiTags('partner-profile')
@Controller('partner/profile')
export class PartnerProfileController {
  constructor(
    private readonly getProfile: GetPartnerProfileUseCase,
    private readonly listAgreements: ListPartnerAcceptancesUseCase,
    private readonly createPartnerDocumentUpload: CreatePartnerDocumentUploadUseCase,
    private readonly updatePayoutInfo: UpdatePayoutInfoUseCase,
    private readonly updateDocuments: UpdatePartnerDocumentsUseCase,
    private readonly submitIdentity: SubmitIdentityUseCase,
    private readonly getTaxAssessment: GetPartnerTaxAssessmentUseCase,
    private readonly recordTaxDeclaration: RecordPartnerTaxDeclarationUseCase,
    private readonly setDefaultPolicy: SetPartnerDefaultCancellationPolicyUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  // Guarded by `manage` rather than a new `read` key on purpose: this response
  // carries the payout bank account and the ID document number, which only the
  // Partner Owner should see — the Staff role holds no `partner.profile.*` key.
  @RequirePermissions('partner.profile.manage')
  @Get()
  @ApiOperation({ summary: "Get the calling partner's own profile" })
  @ApiOkResponse({ type: PartnerResponseDto })
  async profile(): Promise<PartnerResponse> {
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerResponse(await this.getProfile.execute(partnerId));
  }

  @RequirePermissions('partner.profile.manage')
  @Get('agreements')
  @ApiOperation({ summary: "List the calling partner's recorded agreement versions" })
  @ApiOkResponse({ type: PartnerAgreementListResponseDto })
  async agreements(): Promise<PartnerAgreementResponse[]> {
    return this.listAgreements.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
    );
  }

  @RequirePermissions('partner.profile.manage')
  @Get('tax-assessment')
  @ApiOperation({ summary: "Get the calling partner's annual tax assessment" })
  @ApiOkResponse({ type: PartnerTaxAssessmentResponseDto })
  async taxAssessment(
    @Query() query: PartnerTaxYearQueryDto,
  ): Promise<PartnerTaxAssessmentResponse> {
    const result = await this.getTaxAssessment.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
      query.year,
    );
    return toPartnerTaxAssessmentResponse(result.assessment, result.taxStatus);
  }

  @RequirePermissions('partner.profile.manage')
  @UseGuards(RequireCurrentAgreementGuard)
  @Post('tax-declarations')
  @HttpCode(200)
  @ApiOperation({ summary: 'Declare annual revenue earned outside BookingOS' })
  @ApiOkResponse({ type: PartnerTaxAssessmentResponseDto })
  async declareTaxRevenue(
    @Body() input: RecordPartnerTaxDeclarationDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<PartnerTaxAssessmentResponse> {
    const result = await this.recordTaxDeclaration.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
      input,
      principal.userId,
    );
    return toPartnerTaxAssessmentResponse(result.assessment, result.taxStatus);
  }

  @RequirePermissions('partner.profile.manage')
  @UseGuards(RequireCurrentAgreementGuard)
  @Patch('payout')
  @ApiOperation({ summary: 'Update partner payout (bank) details' })
  @ApiOkResponse({ type: PartnerResponseDto })
  async payout(@Body() input: UpdatePayoutInfoDto): Promise<PartnerResponse> {
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerResponse(await this.updatePayoutInfo.execute(partnerId, input));
  }

  @RequirePermissions('partner.profile.manage')
  @UseGuards(RequireCurrentAgreementGuard)
  @Throttle(THROTTLE_UPLOAD)
  @Post('documents/presign')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mint a private partner document upload URL' })
  @ApiOkResponse({ type: PrivateDocumentUploadResponseDto })
  async presignDocument(
    @Body() input: PartnerDocumentUploadDto,
  ): Promise<PrivateDocumentUploadResponse> {
    return this.createPartnerDocumentUpload.execute(
      this.tenantContext.partnerIdOrThrow(),
      input,
    );
  }

  @RequirePermissions('partner.profile.manage')
  @UseGuards(RequireCurrentAgreementGuard)
  @Patch('documents')
  @ApiOperation({ summary: 'Update partner logo + license/business documents' })
  @ApiOkResponse({ type: PartnerResponseDto })
  async documents(@Body() input: UpdatePartnerDocumentsDto): Promise<PartnerResponse> {
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerResponse(await this.updateDocuments.execute(partnerId, input));
  }

  @RequirePermissions('partner.profile.manage')
  @UseGuards(RequireCurrentAgreementGuard)
  @Post('identity')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit identity document metadata for review' })
  @ApiOkResponse({ type: PartnerResponseDto })
  async identity(@Body() input: SubmitIdentityDto): Promise<PartnerResponse> {
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerResponse(await this.submitIdentity.execute(partnerId, input));
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireCurrentAgreementGuard)
  @Patch('default-cancellation-policy')
  @ApiOperation({ summary: "Set the partner's fallback cancellation policy (§11.3)" })
  @ApiOkResponse({ type: PartnerResponseDto })
  async defaultCancellationPolicy(
    @Body() input: SetDefaultCancellationPolicyDto,
  ): Promise<PartnerResponse> {
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerResponse(await this.setDefaultPolicy.execute(partnerId, input.policyId));
  }
}
