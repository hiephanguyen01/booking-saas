import {
  uuidSchema,
  type ListingGroupPendingChangesResponse,
  type ListingRevisionResponse,
} from '@booking/contracts';
import { Controller, Delete, Get, HttpCode, Param, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireCurrentAgreementGuard } from '../../../legal/infrastructure/http/guards/require-current-agreement.guard';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { DiscardListingRevisionUseCase } from '../../application/use-cases/revisions/discard-listing-revision.use-case';
import { GetListingGroupPendingChangesUseCase } from '../../application/use-cases/revisions/get-listing-group-pending-changes.use-case';
import { GetListingRevisionUseCase } from '../../application/use-cases/revisions/get-listing-revision.use-case';
import { ListPendingRevisionsUseCase } from '../../application/use-cases/revisions/list-pending-revisions.use-case';
import {
  ListingGroupPendingChangesResponseDto,
  ListingRevisionResponseDto,
} from './dto/listing.dto';

/**
 * The partner's side of a parked edit (§7.3): read what is waiting on a listing
 * or post, and drop it to go back to the approved content. Saving an edit is not
 * here — it stays on the ordinary `PATCH` of the listing, which decides on its
 * own whether the change can be written in place or has to wait for review.
 */
@ApiTags('partner-listing-revisions')
@Controller('partner')
export class PartnerListingRevisionController {
  constructor(
    private readonly getRevision: GetListingRevisionUseCase,
    private readonly getGroupPendingChanges: GetListingGroupPendingChangesUseCase,
    private readonly listPending: ListPendingRevisionsUseCase,
    private readonly discardRevision: DiscardListingRevisionUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** Every waiting edit of the calling partner — drives the "chờ duyệt" chips. */
  @RequirePermissions('partner.listings.read')
  @Get('listing-revisions')
  @ApiOperation({ summary: "List the calling partner's pending edits" })
  @ApiOkResponse({ type: ListingRevisionResponseDto, isArray: true })
  async list(): Promise<ListingRevisionResponse[]> {
    return this.listPending.execute(this.tenantContext.tenantIdOrThrow(), {
      partnerId: this.tenantContext.partnerIdOrThrow(),
    });
  }

  /** The edit open on one listing: pending, or the last rejection with its note. */
  @RequirePermissions('partner.listings.read')
  @Get('listings/:id/revision')
  @ApiOperation({ summary: 'Get the edit awaiting review for one listing' })
  @UuidParam()
  @ApiOkResponse({ type: ListingRevisionResponseDto })
  async getForListing(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<ListingRevisionResponse | null> {
    return this.getRevision.execute(this.tenantContext.tenantIdOrThrow(), id, {
      requirePartnerId: this.tenantContext.partnerIdOrThrow(),
    });
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard, RequireCurrentAgreementGuard)
  @Delete('listings/:id/revision')
  @HttpCode(204)
  @ApiOperation({ summary: 'Drop the edit awaiting review for one listing' })
  @UuidParam()
  @ApiNoContentResponse()
  async discardForListing(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.discardRevision.execute(this.tenantContext.tenantIdOrThrow(), 'listing', id, {
      partnerId: this.tenantContext.partnerIdOrThrow(),
      actorUserId: principal.userId,
    });
  }

  /** Everything waiting on a post: its own edit plus each edited item. */
  @RequirePermissions('partner.listings.read')
  @Get('listing-groups/:id/pending-changes')
  @ApiOperation({ summary: 'Get every edit awaiting review for one post' })
  @UuidParam()
  @ApiOkResponse({ type: ListingGroupPendingChangesResponseDto })
  async getForGroup(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<ListingGroupPendingChangesResponse> {
    return this.getGroupPendingChanges.execute(this.tenantContext.tenantIdOrThrow(), id, {
      requirePartnerId: this.tenantContext.partnerIdOrThrow(),
    });
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard, RequireCurrentAgreementGuard)
  @Delete('listing-groups/:id/revision')
  @HttpCode(204)
  @ApiOperation({ summary: "Drop the edit awaiting review for one post's own fields" })
  @UuidParam()
  @ApiNoContentResponse()
  async discardForGroup(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.discardRevision.execute(this.tenantContext.tenantIdOrThrow(), 'listing_group', id, {
      partnerId: this.tenantContext.partnerIdOrThrow(),
      actorUserId: principal.userId,
    });
  }
}
