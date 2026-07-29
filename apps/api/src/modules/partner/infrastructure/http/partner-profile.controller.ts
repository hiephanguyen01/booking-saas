import type { PartnerAgreementResponse, PartnerResponse } from '@booking/contracts';
import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toPartnerResponse } from '../../application/partner.mapper';
import { GetPartnerProfileUseCase } from '../../application/use-cases/get-partner-profile.use-case';
import { ListPartnerAgreementsUseCase } from '../../application/use-cases/list-partner-agreements.use-case';
import { SetPartnerDefaultCancellationPolicyUseCase } from '../../application/use-cases/set-partner-default-cancellation-policy.use-case';
import { SubmitIdentityUseCase } from '../../application/use-cases/submit-identity.use-case';
import { UpdatePartnerDocumentsUseCase } from '../../application/use-cases/update-partner-documents.use-case';
import { UpdatePayoutInfoUseCase } from '../../application/use-cases/update-payout-info.use-case';
import {
  PartnerResponseDto,
  PartnerAgreementListResponseDto,
  SetDefaultCancellationPolicyDto,
  SubmitIdentityDto,
  UpdatePartnerDocumentsDto,
  UpdatePayoutInfoDto,
} from './dto/partner.dto';

/** Partner self-service (§7.3) — the partner reads its own record, sets payout
 *  details + submits ID. Scope via x-tenant-id + x-partner-id; the
 *  PermissionsGuard verifies the caller holds a role assignment on that partner,
 *  so every route here is inherently own-record-only. */
@ApiTags('partner-profile')
@Controller('partner/profile')
export class PartnerProfileController {
  constructor(
    private readonly getProfile: GetPartnerProfileUseCase,
    private readonly listAgreements: ListPartnerAgreementsUseCase,
    private readonly updatePayoutInfo: UpdatePayoutInfoUseCase,
    private readonly updateDocuments: UpdatePartnerDocumentsUseCase,
    private readonly submitIdentity: SubmitIdentityUseCase,
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
  @Patch('payout')
  @ApiOperation({ summary: 'Update partner payout (bank) details' })
  @ApiOkResponse({ type: PartnerResponseDto })
  async payout(@Body() input: UpdatePayoutInfoDto): Promise<PartnerResponse> {
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerResponse(await this.updatePayoutInfo.execute(partnerId, input));
  }

  @RequirePermissions('partner.profile.manage')
  @Patch('documents')
  @ApiOperation({ summary: 'Update partner logo + license/business documents' })
  @ApiOkResponse({ type: PartnerResponseDto })
  async documents(@Body() input: UpdatePartnerDocumentsDto): Promise<PartnerResponse> {
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerResponse(await this.updateDocuments.execute(partnerId, input));
  }

  @RequirePermissions('partner.profile.manage')
  @Post('identity')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit identity document metadata for review' })
  @ApiOkResponse({ type: PartnerResponseDto })
  async identity(@Body() input: SubmitIdentityDto): Promise<PartnerResponse> {
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerResponse(await this.submitIdentity.execute(partnerId, input));
  }

  @RequirePermissions('partner.listings.write')
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
