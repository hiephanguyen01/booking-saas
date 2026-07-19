import type { ReviewListResponse } from '@booking/contracts';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toReviewListResponse } from '../../application/review.mapper';
import { ListTenantReviewsUseCase } from '../../application/use-cases/list-tenant-reviews.use-case';
import { ReviewListResponseDto, TenantReviewsQueryDto } from './dto/review.dto';

@ApiTags('tenant-reviews')
@Controller('tenant/reviews')
export class TenantReviewController {
  constructor(
    private readonly listReviews: ListTenantReviewsUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.reviews.read')
  @Get()
  @ApiOperation({ summary: 'List tenant-wide verified reviews' })
  @ApiOkResponse({ type: ReviewListResponseDto })
  async list(@Query() query: TenantReviewsQueryDto): Promise<ReviewListResponse> {
    return toReviewListResponse(
      await this.listReviews.execute(this.tenantContext.tenantIdOrThrow(), query),
      query,
    );
  }
}
