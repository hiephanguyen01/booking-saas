import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  uuidSchema,
  type AffiliateCommissionResponse,
  type AffiliateResponse,
  type AffiliateStatsResponse,
  type ReferralLinkResponse,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequireApprovedAffiliateUseCase } from '../../application/use-cases/require-approved-affiliate.use-case';
import { RequireAffiliateMembershipUseCase } from '../../application/use-cases/require-affiliate-membership.use-case';
import { ApplyAffiliateUseCase } from '../../application/use-cases/apply-affiliate.use-case';
import { ListAffiliateMembershipsUseCase } from '../../application/use-cases/list-affiliate-memberships.use-case';
import { UpdateAffiliatePayoutInfoUseCase } from '../../application/use-cases/update-affiliate-payout-info.use-case';
import { ListAffiliateLinksUseCase } from '../../application/use-cases/list-affiliate-links.use-case';
import { CreateReferralLinkUseCase } from '../../application/use-cases/create-referral-link.use-case';
import { DeleteReferralLinkUseCase } from '../../application/use-cases/delete-referral-link.use-case';
import { GetAffiliateStatsUseCase } from '../../application/use-cases/get-affiliate-stats.use-case';
import { ListAffiliateCommissionsUseCase } from '../../application/use-cases/list-affiliate-commissions.use-case';
import {
  toAffiliateCommissionResponse,
  toAffiliateResponse,
  toReferralLinkResponse,
  toStatsResponse,
} from '../../application/affiliate.mapper';
import {
  AffiliateCommissionResponseDto,
  AffiliateResponseDto,
  AffiliateStatsResponseDto,
  ApplyAffiliateDto,
  CreateReferralLinkDto,
  ReferralLinkResponseDto,
  UpdateAffiliatePayoutInfoDto,
} from './dto/affiliate.dto';

/**
 * Affiliate self-service portal (§15.3). Membership-gated (not RBAC): any logged-in
 * user; the affiliate account is resolved from the `affiliates` table. The optional
 * `x-affiliate-tenant` header picks a specific membership when the user is an
 * affiliate for more than one tenant (defaults to the first approved one).
 */
@ApiTags('affiliate')
@Controller('affiliate')
export class AffiliateController {
  constructor(
    private readonly requireApproved: RequireApprovedAffiliateUseCase,
    private readonly requireMembership: RequireAffiliateMembershipUseCase,
    private readonly applyAffiliate: ApplyAffiliateUseCase,
    private readonly listMemberships: ListAffiliateMembershipsUseCase,
    private readonly updatePayoutInfo: UpdateAffiliatePayoutInfoUseCase,
    private readonly listLinks: ListAffiliateLinksUseCase,
    private readonly createLink: CreateReferralLinkUseCase,
    private readonly deleteLink: DeleteReferralLinkUseCase,
    private readonly stats: GetAffiliateStatsUseCase,
    private readonly listCommissions: ListAffiliateCommissionsUseCase,
  ) {}

  @AuthenticatedOnly()
  @Get('me')
  @ApiOperation({ summary: "List the user's affiliate memberships (one per tenant)" })
  @ApiOkResponse({ type: [AffiliateResponseDto] })
  async me(@CurrentPrincipal() principal: SessionPrincipal): Promise<AffiliateResponse[]> {
    const memberships = await this.listMemberships.execute(principal.userId);
    return memberships.map(toAffiliateResponse);
  }

  @AuthenticatedOnly()
  @Post('apply')
  @ApiOperation({ summary: 'Apply to become an affiliate for a tenant' })
  @ApiCreatedResponse({ type: AffiliateResponseDto })
  async apply(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: ApplyAffiliateDto,
  ): Promise<AffiliateResponse> {
    return toAffiliateResponse(await this.applyAffiliate.execute(principal.userId, input));
  }

  @AuthenticatedOnly()
  @Patch('payout-info')
  @ApiOperation({ summary: "Correct the affiliate's own payout (bank) details" })
  @ApiOkResponse({ type: AffiliateResponseDto })
  async payoutInfo(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: UpdateAffiliatePayoutInfoDto,
    @Headers('x-affiliate-tenant') tenantHeader?: string,
  ): Promise<AffiliateResponse> {
    // `requireMembership`, not `requireApproved`: a pending applicant must be able
    // to fix the account number it is to be paid into (see the use case).
    const ctx = await this.requireMembership.execute(principal.userId, tenantHeader);
    return toAffiliateResponse(await this.updatePayoutInfo.execute(ctx.tenantId, ctx.affiliateId, input));
  }

  @AuthenticatedOnly()
  @Get('links')
  @ApiOperation({ summary: "List the affiliate's referral links" })
  @ApiOkResponse({ type: [ReferralLinkResponseDto] })
  async links(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Headers('x-affiliate-tenant') tenantHeader?: string,
  ): Promise<ReferralLinkResponse[]> {
    const ctx = await this.requireApproved.execute(principal.userId, tenantHeader);
    const links = await this.listLinks.execute(ctx.tenantId, ctx.affiliateId);
    return links.map(toReferralLinkResponse);
  }

  @AuthenticatedOnly()
  @Post('links')
  @ApiOperation({ summary: 'Create a referral link' })
  @ApiCreatedResponse({ type: ReferralLinkResponseDto })
  async createReferralLink(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: CreateReferralLinkDto,
    @Headers('x-affiliate-tenant') tenantHeader?: string,
  ): Promise<ReferralLinkResponse> {
    const ctx = await this.requireApproved.execute(principal.userId, tenantHeader);
    return toReferralLinkResponse(await this.createLink.execute(ctx.tenantId, ctx.affiliateId, input));
  }

  @AuthenticatedOnly()
  @Delete('links/:id')
  @UuidParam()
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a referral link' })
  async removeReferralLink(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Headers('x-affiliate-tenant') tenantHeader?: string,
  ): Promise<void> {
    const ctx = await this.requireApproved.execute(principal.userId, tenantHeader);
    await this.deleteLink.execute(ctx.tenantId, ctx.affiliateId, id);
  }

  @AuthenticatedOnly()
  @Get('stats')
  @ApiOperation({ summary: 'Clicks + commission totals for the affiliate dashboard' })
  @ApiOkResponse({ type: AffiliateStatsResponseDto })
  async getStats(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Headers('x-affiliate-tenant') tenantHeader?: string,
  ): Promise<AffiliateStatsResponse> {
    const ctx = await this.requireApproved.execute(principal.userId, tenantHeader);
    const s = await this.stats.execute(ctx.tenantId, ctx.affiliateId);
    return toStatsResponse(s.totals, s.clicks);
  }

  @AuthenticatedOnly()
  @Get('commissions')
  @ApiOperation({ summary: "The affiliate's commission history" })
  @ApiOkResponse({ type: [AffiliateCommissionResponseDto] })
  async commissions(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Headers('x-affiliate-tenant') tenantHeader?: string,
  ): Promise<AffiliateCommissionResponse[]> {
    const ctx = await this.requireApproved.execute(principal.userId, tenantHeader);
    const items = await this.listCommissions.execute(ctx.tenantId, ctx.affiliateId);
    return items.map(toAffiliateCommissionResponse);
  }
}
