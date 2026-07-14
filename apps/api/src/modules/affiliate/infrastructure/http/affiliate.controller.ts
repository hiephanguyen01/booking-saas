import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
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
import { AffiliateContextService } from '../../application/affiliate-context.service';
import { ApplyAffiliateUseCase } from '../../application/use-cases/apply-affiliate.use-case';
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
    private readonly context: AffiliateContextService,
    private readonly applyAffiliate: ApplyAffiliateUseCase,
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
    const memberships = await this.context.memberships(principal.userId);
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
    const { affiliate, tenantName } = await this.applyAffiliate.execute(principal.userId, input);
    return toAffiliateResponse({ ...affiliate, tenantName });
  }

  @AuthenticatedOnly()
  @Get('links')
  @ApiOperation({ summary: "List the affiliate's referral links" })
  @ApiOkResponse({ type: [ReferralLinkResponseDto] })
  async links(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Headers('x-affiliate-tenant') tenantHeader?: string,
  ): Promise<ReferralLinkResponse[]> {
    const ctx = await this.context.requireApproved(principal.userId, tenantHeader);
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
    const ctx = await this.context.requireApproved(principal.userId, tenantHeader);
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
    const ctx = await this.context.requireApproved(principal.userId, tenantHeader);
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
    const ctx = await this.context.requireApproved(principal.userId, tenantHeader);
    const s = await this.stats.execute(ctx.tenantId, ctx.affiliateId);
    return toStatsResponse(
      { pending: s.pending, confirmed: s.confirmed, paid: s.paid, bookings: s.bookings },
      s.clicks,
    );
  }

  @AuthenticatedOnly()
  @Get('commissions')
  @ApiOperation({ summary: "The affiliate's commission history" })
  @ApiOkResponse({ type: [AffiliateCommissionResponseDto] })
  async commissions(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Headers('x-affiliate-tenant') tenantHeader?: string,
  ): Promise<AffiliateCommissionResponse[]> {
    const ctx = await this.context.requireApproved(principal.userId, tenantHeader);
    const items = await this.listCommissions.execute(ctx.tenantId, ctx.affiliateId);
    return items.map(toAffiliateCommissionResponse);
  }
}
