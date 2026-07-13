import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createListingInputSchema,
  moderationReasonInputSchema,
  updateListingInputSchema,
  uuidSchema,
  type CreateListingInput,
  type ListingResponse,
  type ListingReviewResponse,
  type ModerationReasonInput,
  type UpdateListingInput,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { PlanLimitGuard } from '../../../tenancy/infrastructure/http/guards/plan-limit.guard';
import { EnforcePlanLimit } from '../../../tenancy/infrastructure/http/decorators/enforce-plan-limit.decorator';
import { SubmitListingUseCase } from '../../application/use-cases/moderation/submit-listing.use-case';
import { HideListingUseCase } from '../../application/use-cases/moderation/hide-listing.use-case';
import { RepublishListingUseCase } from '../../application/use-cases/moderation/republish-listing.use-case';
import { ListListingsUseCase } from '../../application/use-cases/list-listings.use-case';
import { CreateListingUseCase } from '../../application/use-cases/create-listing.use-case';
import { GetListingUseCase } from '../../application/use-cases/get-listing.use-case';
import { UpdateListingUseCase } from '../../application/use-cases/update-listing.use-case';
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
    private readonly createListing: CreateListingUseCase,
    private readonly getListing: GetListingUseCase,
    private readonly updateListing: UpdateListingUseCase,
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

  /**
   * Create a listing for the calling partner (Task 1.14). `partnerId` is forced
   * from the session scope — never trusted from the body — so a partner can only
   * create under their own account. New listings start as `draft`; the partner
   * then submits for review via `POST :id/submit`.
   */
  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard, PlanLimitGuard)
  @EnforcePlanLimit('listing')
  @Post()
  async create(
    @Body(new ZodValidationPipe(createListingInputSchema)) input: CreateListingInput,
  ): Promise<ListingResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toListingResponse(await this.createListing.execute(tenantId, { ...input, partnerId }));
  }

  /** A single own listing — for the edit-form prefill. 404 if not the partner's. */
  @RequirePermissions('partner.listings.read')
  @Get(':id')
  async getOne(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<ListingResponse> {
    return toListingResponse(await this.ownedListing(id));
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id')
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateListingInputSchema)) input: UpdateListingInput,
  ): Promise<ListingResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    await this.ownedListing(id); // ownership guard (partnerId is immutable on update)
    return toListingResponse(await this.updateListing.execute(tenantId, id, input));
  }

  /** Load a listing and assert it belongs to the calling partner (else 403). */
  private async ownedListing(id: string) {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    const listing = await this.getListing.execute(tenantId, id);
    if (listing.partnerId !== partnerId) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'LISTING_NOT_OWNED',
        message: 'This listing belongs to another partner',
      });
    }
    return listing;
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
