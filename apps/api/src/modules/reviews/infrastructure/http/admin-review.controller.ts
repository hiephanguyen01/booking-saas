import type { AdminReviewListResponse } from '@booking/contracts';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toAdminReviewListResponse } from '../../application/review.mapper';
import { ListAdminReviewsUseCase } from '../../application/use-cases/list-admin-reviews.use-case';
import { AdminReviewListResponseDto, AdminReviewsQueryDto } from './dto/review.dto';

@ApiTags('admin-reviews')
@Controller('admin/reviews')
export class AdminReviewController {
  constructor(private readonly listReviews: ListAdminReviewsUseCase) {}

  @RequirePermissions('platform.reviews.read')
  @Get()
  @ApiOperation({ summary: 'List reviews across tenants for support and audit' })
  @ApiOkResponse({ type: AdminReviewListResponseDto })
  async list(@Query() query: AdminReviewsQueryDto): Promise<AdminReviewListResponse> {
    return toAdminReviewListResponse(await this.listReviews.execute(query), query);
  }
}
