import { Body, Controller, Get, HttpCode, Ip, Param, Post, UseGuards } from '@nestjs/common';
import {
  moderationReasonInputSchema,
  uuidSchema,
  type ListingResponse,
  type ListingReviewResponse,
  type ModerationReasonInput,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { SubmitListingUseCase } from '../../application/use-cases/moderation/submit-listing.use-case';
import { HideListingUseCase } from '../../application/use-cases/moderation/hide-listing.use-case';
import { RepublishListingUseCase } from '../../application/use-cases/moderation/republish-listing.use-case';
import { ListListingsUseCase } from '../../application/use-cases/list-listings.use-case';
import { toListingResponse } from '../../application/listing.mapper';

/**
 * Partner-side listing moderation (§7.3). The partner acts as `partner`; every
 * action is restricted to the partner's own listings, and re-publishing a post
 * an admin hid is blocked (LISTING_ADMIN_LOCKED). Scope via x-partner-id.
 */
@Controller('partner/listings')
export class PartnerListingModerationController {
  constructor(
    private readonly submitListing: SubmitListingUseCase,
    private readonly hideListing: HideListingUseCase,
    private readonly republishListing: RepublishListingUseCase,
    private readonly listListings: ListListingsUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** The partner's own listings (§7.3) — read-only, scoped to x-partner-id. */
  @RequirePermissions('partner.listings.read')
  @Get()
  async list(): Promise<ListingResponse[]> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    const listings = await this.listListings.execute(tenantId, { partnerId });
    return listings.map(toListingResponse);
  }

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
  async submit(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<{ listing: ListingResponse; review: ListingReviewResponse }> {
    const { listing, review } = await this.submitListing.execute(this.ctx(principal, ip), id);
    return { listing: toListingResponse(listing), review };
  }

  @RequirePermissions('partner.listings.publish')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/hide')
  @HttpCode(200)
  async hide(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(moderationReasonInputSchema)) body: ModerationReasonInput,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<ListingResponse> {
    return toListingResponse(
      await this.hideListing.execute(this.ctx(principal, ip), id, 'partner', body.reason),
    );
  }

  @RequirePermissions('partner.listings.publish')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/republish')
  @HttpCode(200)
  async republish(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<ListingResponse> {
    return toListingResponse(
      await this.republishListing.execute(this.ctx(principal, ip), id, 'partner'),
    );
  }
}
