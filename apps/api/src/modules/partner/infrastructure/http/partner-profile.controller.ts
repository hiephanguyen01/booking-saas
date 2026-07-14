import {
  type PartnerResponse
} from '@booking/contracts';
import { Body, Controller, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toPartnerResponse } from '../../application/partner.mapper';
import { SubmitIdentityUseCase } from '../../application/use-cases/submit-identity.use-case';
import { UpdatePartnerDocumentsUseCase } from '../../application/use-cases/update-partner-documents.use-case';
import { UpdatePayoutInfoUseCase } from '../../application/use-cases/update-payout-info.use-case';
import {
  PartnerResponseDto,
  SubmitIdentityDto,
  UpdatePartnerDocumentsDto,
  UpdatePayoutInfoDto,
} from './dto/partner.dto';

/** Partner self-service (§7.3) — the partner sets payout details + submits ID.
 *  Scope via x-partner-id; the PermissionsGuard verifies membership. */
@ApiTags('partner-profile')
@Controller('partner/profile')
export class PartnerProfileController {
  constructor(
    private readonly updatePayoutInfo: UpdatePayoutInfoUseCase,
    private readonly updateDocuments: UpdatePartnerDocumentsUseCase,
    private readonly submitIdentity: SubmitIdentityUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

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
}
