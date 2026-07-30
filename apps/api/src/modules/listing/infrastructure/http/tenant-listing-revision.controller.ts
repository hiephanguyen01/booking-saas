import {
  uuidSchema,
  type ListingGroupPendingChangesResponse,
  type ListingRevisionResponse,
} from '@booking/contracts';
import { Body, Controller, Get, HttpCode, Ip, Param, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { ApproveListingRevisionUseCase } from '../../application/use-cases/revisions/approve-listing-revision.use-case';
import { GetListingGroupPendingChangesUseCase } from '../../application/use-cases/revisions/get-listing-group-pending-changes.use-case';
import { GetListingRevisionUseCase } from '../../application/use-cases/revisions/get-listing-revision.use-case';
import { ListPendingRevisionsUseCase } from '../../application/use-cases/revisions/list-pending-revisions.use-case';
import { RejectListingRevisionUseCase } from '../../application/use-cases/revisions/reject-listing-revision.use-case';
import {
  ListingGroupPendingChangesResponseDto,
  ListingRevisionResponseDto,
  PublishListingDto,
  RejectRevisionDto,
} from './dto/listing.dto';

/**
 * The reviewer's side of a parked edit (§7.3): the queue of waiting changes, the
 * diff for one target, and the decision. Approving writes the change onto the
 * live record through the ordinary update path; rejecting leaves the live record
 * alone and sends the note back to the partner.
 */
@ApiTags('tenant-listing-revisions')
@Controller('tenant')
export class TenantListingRevisionController {
  constructor(
    private readonly listPending: ListPendingRevisionsUseCase,
    private readonly getRevision: GetListingRevisionUseCase,
    private readonly getGroupPendingChanges: GetListingGroupPendingChangesUseCase,
    private readonly approveRevision: ApproveListingRevisionUseCase,
    private readonly rejectRevision: RejectListingRevisionUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ctx(principal: SessionPrincipal, ip: string) {
    return {
      tenantId: this.tenantContext.tenantIdOrThrow(),
      actorUserId: principal.userId,
      ip,
    };
  }

  /** The "changes" queue: every edit waiting on any listing or post. */
  @RequirePermissions('tenant.listings.read')
  @Get('listing-revisions')
  @ApiOperation({ summary: 'List every edit awaiting review' })
  @ApiOkResponse({ type: ListingRevisionResponseDto, isArray: true })
  async list(): Promise<ListingRevisionResponse[]> {
    return this.listPending.execute(this.tenantContext.tenantIdOrThrow());
  }

  @RequirePermissions('tenant.listings.read')
  @Get('listings/:id/revision')
  @ApiOperation({ summary: 'Get the edit awaiting review for one listing' })
  @UuidParam()
  @ApiOkResponse({ type: ListingRevisionResponseDto })
  async getForListing(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<ListingRevisionResponse | null> {
    return this.getRevision.execute(this.tenantContext.tenantIdOrThrow(), id, {
      pendingOnly: true,
    });
  }

  @RequirePermissions('tenant.listings.publish')
  @Post('listings/:id/revision/approve')
  @HttpCode(204)
  @ApiOperation({ summary: "Apply a listing's pending edit to the live listing" })
  @UuidParam()
  @ApiNoContentResponse()
  async approveForListing(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: PublishListingDto,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<void> {
    await this.approveRevision.execute(this.ctx(principal, ip), id, body.force);
  }

  @RequirePermissions('tenant.listings.publish')
  @Post('listings/:id/revision/reject')
  @HttpCode(204)
  @ApiOperation({ summary: "Turn down a listing's pending edit with a note" })
  @UuidParam()
  @ApiNoContentResponse()
  async rejectForListing(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: RejectRevisionDto,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<void> {
    await this.rejectRevision.execute(this.ctx(principal, ip), 'listing', id, body.note);
  }

  @RequirePermissions('tenant.listings.read')
  @Get('listing-groups/:id/pending-changes')
  @ApiOperation({ summary: 'Get every edit awaiting review for one post' })
  @UuidParam()
  @ApiOkResponse({ type: ListingGroupPendingChangesResponseDto })
  async getForGroup(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<ListingGroupPendingChangesResponse> {
    return this.getGroupPendingChanges.execute(this.tenantContext.tenantIdOrThrow(), id);
  }

  /**
   * A post is reviewed as a unit: this applies the post's own edit and every
   * waiting item edit in one transaction.
   */
  @RequirePermissions('tenant.listings.publish')
  @Post('listing-groups/:id/pending-changes/approve')
  @HttpCode(204)
  @ApiOperation({ summary: 'Apply every pending edit of a post to its live records' })
  @UuidParam()
  @ApiNoContentResponse()
  async approveForGroup(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: PublishListingDto,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<void> {
    const ctx = this.ctx(principal, ip);
    const pending = await this.getGroupPendingChanges.execute(ctx.tenantId, id);
    await this.approveRevision.executeForGroup(
      ctx,
      id,
      pending.listings.map((revision) => revision.targetId),
      body.force,
    );
  }

  @RequirePermissions('tenant.listings.publish')
  @Post('listing-groups/:id/revision/reject')
  @HttpCode(204)
  @ApiOperation({ summary: "Turn down a post's pending edit with a note" })
  @UuidParam()
  @ApiNoContentResponse()
  async rejectForGroup(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: RejectRevisionDto,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ): Promise<void> {
    await this.rejectRevision.execute(this.ctx(principal, ip), 'listing_group', id, body.note);
  }
}
