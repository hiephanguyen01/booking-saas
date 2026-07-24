import {
  uuidSchema,
  type ListingResponse,
  type PaginatedWithCounts,
  type DepositRequirementResponse,
  type SubmitListingResponse,
} from '@booking/contracts';
import {
  Body,
  Controller,
  Get,
  Delete,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPaginatedResponse, UuidParam } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { EnforcePlanLimit } from '../../../tenancy/infrastructure/http/decorators/enforce-plan-limit.decorator';
import { PlanLimitGuard } from '../../../tenancy/infrastructure/http/guards/plan-limit.guard';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { toListingResponse } from '../../application/listing.mapper';
import { CreateListingUseCase } from '../../application/use-cases/create-listing.use-case';
import { GetListingUseCase } from '../../application/use-cases/get-listing.use-case';
import { ListListingsUseCase } from '../../application/use-cases/list-listings.use-case';
import { HideListingUseCase } from '../../application/use-cases/moderation/hide-listing.use-case';
import { RepublishListingUseCase } from '../../application/use-cases/moderation/republish-listing.use-case';
import { SubmitListingUseCase } from '../../application/use-cases/moderation/submit-listing.use-case';
import { UpdateListingUseCase } from '../../application/use-cases/update-listing.use-case';
import { DeleteListingUseCase } from '../../application/use-cases/delete-listing.use-case';
import { GetListingDepositRequirementUseCase } from '../../application/use-cases/get-listing-deposit-requirement.use-case';
import {
  CreateListingDto,
  ListingResponseDto,
  ListPartnerListingsQueryDto,
  ModerationReasonDto,
  SubmitListingResponseDto,
  UpdateListingDto,
  DepositRequirementResponseDto,
} from './dto/listing.dto';

/**
 * Partner-side listing moderation (§7.3). The partner acts as `partner`; every
 * action is restricted to the partner's own listings, and re-publishing a post
 * an admin hid is blocked (LISTING_ADMIN_LOCKED). Scope via x-partner-id.
 */
@ApiTags('partner-listing-moderation')
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
    private readonly deleteListing: DeleteListingUseCase,
    private readonly getDepositRequirement: GetListingDepositRequirementUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.listings.read')
  @Get('deposit-requirement')
  @ApiOperation({ summary: 'Preview the minimum deposit for a listing target' })
  @ApiOkResponse({ type: DepositRequirementResponseDto })
  async depositRequirement(
    @Query('listingTypeId', new ZodValidationPipe(uuidSchema)) listingTypeId: string,
    @Query('categoryId', new ZodValidationPipe(uuidSchema.optional())) categoryId?: string,
  ): Promise<DepositRequirementResponse> {
    return this.getDepositRequirement.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
      listingTypeId,
      categoryId ?? null,
    );
  }

  /**
   * The partner's own listings (§7.3) — read-only, paginated, always scoped to
   * x-partner-id. Filterable by `status` and a `q` title search, with per-status
   * row counts for the filter tabs; `groupId` narrows to one post's items.
   */
  @RequirePermissions('partner.listings.read')
  @Get()
  @ApiOperation({ summary: "List the calling partner's listings" })
  @ApiPaginatedResponse(ListingResponseDto)
  async list(
    @Query() query: ListPartnerListingsQueryDto,
  ): Promise<PaginatedWithCounts<ListingResponse>> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    const result = await this.listListings.execute(
      tenantId,
      { partnerId, groupId: query.groupId, status: query.status, q: query.q },
      { page: query.page, pageSize: query.pageSize },
    );
    return { ...toPaginated(query, result, toListingResponse), counts: result.counts };
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
  @ApiOperation({ summary: 'Create a listing for the calling partner' })
  @ApiCreatedResponse({ type: ListingResponseDto })
  async create(@Body() input: CreateListingDto): Promise<ListingResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toListingResponse(await this.createListing.execute(tenantId, { ...input, partnerId }));
  }

  /** A single own listing — for the edit-form prefill. 404 if not the partner's. */
  @RequirePermissions('partner.listings.read')
  @Get(':id')
  @ApiOperation({ summary: "Get one of the partner's own listings" })
  @UuidParam()
  @ApiOkResponse({ type: ListingResponseDto })
  async getOne(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<ListingResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toListingResponse(
      await this.getListing.execute(tenantId, id, { requirePartnerId: partnerId }),
    );
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id')
  @ApiOperation({ summary: "Update one of the partner's own listings" })
  @UuidParam()
  @ApiOkResponse({ type: ListingResponseDto })
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: UpdateListingDto,
  ): Promise<ListingResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerIdOrThrow();
    return toListingResponse(
      await this.updateListing.execute(tenantId, id, input, { requirePartnerId: partnerId }),
    );
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: "Delete the partner's own draft listing" })
  @ApiNoContentResponse()
  async remove(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    await this.deleteListing.execute(this.tenantContext.tenantIdOrThrow(), id, {
      requirePartnerId: this.tenantContext.partnerIdOrThrow(),
    });
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
  @ApiOperation({ summary: 'Submit a listing for review' })
  @UuidParam()
  @ApiOkResponse({ type: SubmitListingResponseDto })
  async submit(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<SubmitListingResponse> {
    const { listing, review } = await this.submitListing.execute(this.ctx(principal, ip), id);
    return { listing: toListingResponse(listing), review };
  }

  @RequirePermissions('partner.listings.publish')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post(':id/hide')
  @HttpCode(200)
  @ApiOperation({ summary: "Hide the partner's own published listing" })
  @UuidParam()
  @ApiOkResponse({ type: ListingResponseDto })
  async hide(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: ModerationReasonDto,
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
  @ApiOperation({ summary: "Republish the partner's own hidden listing" })
  @UuidParam()
  @ApiOkResponse({ type: ListingResponseDto })
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
