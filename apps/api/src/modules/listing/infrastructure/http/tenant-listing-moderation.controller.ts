import { Body, Controller, Get, HttpCode, Ip, Param, Post, UseGuards } from '@nestjs/common';
import {
  moderationReasonInputSchema,
  publishListingInputSchema,
  uuidSchema,
  type ListingResponse,
  type ListingReviewResponse,
  type ModerationReasonInput,
  type PublishListingInput,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { ReviewListingUseCase } from '../../application/use-cases/moderation/review-listing.use-case';
import { PublishListingUseCase } from '../../application/use-cases/moderation/publish-listing.use-case';
import { HideListingUseCase } from '../../application/use-cases/moderation/hide-listing.use-case';
import { RepublishListingUseCase } from '../../application/use-cases/moderation/republish-listing.use-case';
import { toListingResponse } from '../../application/listing.mapper';

/** Tenant-side listing moderation (§7.3). The reviewer acts as `admin`. */
@Controller('tenant/listings')
export class TenantListingModerationController {
  constructor(
    private readonly reviewListing: ReviewListingUseCase,
    private readonly publishListing: PublishListingUseCase,
    private readonly hideListing: HideListingUseCase,
    private readonly republishListing: RepublishListingUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.listings.publish')
  @Get(':id/review')
  async review(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<ListingReviewResponse> {
    return this.reviewListing.execute(this.tenantContext.tenantIdOrThrow(), id);
  }

  @RequirePermissions('tenant.listings.publish')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/publish')
  @HttpCode(200)
  async publish(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(publishListingInputSchema)) body: PublishListingInput,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<ListingResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return toListingResponse(
      await this.publishListing.execute(
        { tenantId, actorUserId: principal.userId, ip },
        id,
        body.force,
      ),
    );
  }

  @RequirePermissions('tenant.listings.publish')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/hide')
  @HttpCode(200)
  async hide(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(moderationReasonInputSchema)) body: ModerationReasonInput,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<ListingResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return toListingResponse(
      await this.hideListing.execute(
        { tenantId, actorUserId: principal.userId, ip },
        id,
        'admin',
        body.reason,
      ),
    );
  }

  @RequirePermissions('tenant.listings.publish')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/republish')
  @HttpCode(200)
  async republish(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<ListingResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return toListingResponse(
      await this.republishListing.execute({ tenantId, actorUserId: principal.userId, ip }, id, 'admin'),
    );
  }
}
