import { Body, Controller, HttpCode, Ip, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { uuidSchema, type ListingGroupResponse } from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { SubmitListingGroupUseCase } from '../../application/use-cases/moderation/submit-listing-group.use-case';
import { HideListingGroupUseCase } from '../../application/use-cases/moderation/hide-listing-group.use-case';
import { RepublishListingGroupUseCase } from '../../application/use-cases/moderation/republish-listing-group.use-case';
import { toListingGroupResponse } from '../../application/listing.mapper';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { ListingGroupResponseDto, ModerationReasonDto } from './dto/listing.dto';

/** Partner-side post moderation (§7.3); own posts only, admin-hide lockout applies. */
@ApiTags('partner-listing-group-moderation')
@Controller('partner/listing-groups')
export class PartnerListingGroupModerationController {
  constructor(
    private readonly submitGroup: SubmitListingGroupUseCase,
    private readonly hideGroup: HideListingGroupUseCase,
    private readonly republishGroup: RepublishListingGroupUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ctx(principal: SessionPrincipal, ip: string) {
    return {
      tenantId: this.tenantContext.tenantIdOrThrow(),
      partnerId: this.tenantContext.partnerIdOrThrow(),
      actorUserId: principal.userId,
      ip,
    };
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit a listing group for review' })
  @UuidParam()
  @ApiOkResponse({ type: ListingGroupResponseDto })
  async submit(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<ListingGroupResponse> {
    return toListingGroupResponse(await this.submitGroup.execute(this.ctx(principal, ip), id));
  }

  @RequirePermissions('partner.listings.publish')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/hide')
  @HttpCode(200)
  @ApiOperation({ summary: "Hide the partner's own listing group" })
  @UuidParam()
  @ApiOkResponse({ type: ListingGroupResponseDto })
  async hide(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: ModerationReasonDto,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<ListingGroupResponse> {
    return toListingGroupResponse(
      await this.hideGroup.execute(this.ctx(principal, ip), id, 'partner', body.reason),
    );
  }

  @RequirePermissions('partner.listings.publish')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/republish')
  @HttpCode(200)
  @ApiOperation({ summary: "Republish the partner's own listing group" })
  @UuidParam()
  @ApiOkResponse({ type: ListingGroupResponseDto })
  async republish(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<ListingGroupResponse> {
    return toListingGroupResponse(
      await this.republishGroup.execute(this.ctx(principal, ip), id, 'partner'),
    );
  }
}
