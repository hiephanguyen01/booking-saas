import type { ReviewListResponse, ReviewResponse } from '@booking/contracts';
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireCurrentAgreementGuard } from '../../../legal/infrastructure/http/guards/require-current-agreement.guard';
import { toReviewListResponse, toReviewResponse } from '../../application/review.mapper';
import { ListPartnerReviewsUseCase } from '../../application/use-cases/list-partner-reviews.use-case';
import { ReplyReviewUseCase } from '../../application/use-cases/reply-review.use-case';
import {
  PartnerReviewsQueryDto,
  ReplyReviewDto,
  ReviewListResponseDto,
  ReviewResponseDto,
} from './dto/review.dto';

@ApiTags('partner-reviews')
@Controller('partner/reviews')
export class PartnerReviewController {
  constructor(
    private readonly listReviews: ListPartnerReviewsUseCase,
    private readonly replyReview: ReplyReviewUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.reviews.read')
  @Get()
  @ApiOperation({ summary: 'List reviews for the partner own bookings' })
  @ApiOkResponse({ type: ReviewListResponseDto })
  async list(@Query() query: PartnerReviewsQueryDto): Promise<ReviewListResponse> {
    return toReviewListResponse(
      await this.listReviews.execute(
        this.tenantContext.tenantIdOrThrow(),
        this.tenantContext.partnerIdOrThrow(),
        query,
      ),
      query,
    );
  }

  @RequirePermissions('partner.reviews.reply')
  @UseGuards(RequireCurrentAgreementGuard)
  @Post(':id/reply')
  @UuidParam()
  @ApiOperation({ summary: 'Reply once to an owned verified review' })
  @ApiCreatedResponse({ type: ReviewResponseDto })
  async reply(
    @Param('id') id: string,
    @Body() input: ReplyReviewDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<ReviewResponse> {
    return toReviewResponse(
      await this.replyReview.execute(
        this.tenantContext.tenantIdOrThrow(),
        id,
        this.tenantContext.partnerIdOrThrow(),
        principal.userId,
        input,
      ),
    );
  }
}
