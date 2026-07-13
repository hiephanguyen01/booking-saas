import { Body, Controller, HttpCode, Patch, Post } from '@nestjs/common';
import {
  submitIdentityInputSchema,
  updatePartnerDocumentsInputSchema,
  updatePayoutInfoInputSchema,
  type PartnerResponse,
  type SubmitIdentityInput,
  type UpdatePartnerDocumentsInput,
  type UpdatePayoutInfoInput,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { UpdatePayoutInfoUseCase } from '../../application/use-cases/update-payout-info.use-case';
import { UpdatePartnerDocumentsUseCase } from '../../application/use-cases/update-partner-documents.use-case';
import { SubmitIdentityUseCase } from '../../application/use-cases/submit-identity.use-case';
import { toPartnerResponse } from '../../application/partner.mapper';

/** Partner self-service (§7.3) — the partner sets payout details + submits ID.
 *  Scope via x-partner-id; the PermissionsGuard verifies membership. */
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
  async payout(
    @Body(new ZodValidationPipe(updatePayoutInfoInputSchema)) input: UpdatePayoutInfoInput,
  ): Promise<PartnerResponse> {
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerResponse(await this.updatePayoutInfo.execute(partnerId, input));
  }

  @RequirePermissions('partner.profile.manage')
  @Patch('documents')
  async documents(
    @Body(new ZodValidationPipe(updatePartnerDocumentsInputSchema)) input: UpdatePartnerDocumentsInput,
  ): Promise<PartnerResponse> {
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerResponse(await this.updateDocuments.execute(partnerId, input));
  }

  @RequirePermissions('partner.profile.manage')
  @Post('identity')
  @HttpCode(200)
  async identity(
    @Body(new ZodValidationPipe(submitIdentityInputSchema)) input: SubmitIdentityInput,
  ): Promise<PartnerResponse> {
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toPartnerResponse(await this.submitIdentity.execute(partnerId, input));
  }
}
