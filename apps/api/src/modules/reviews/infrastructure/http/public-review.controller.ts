import type { ReviewListResponse } from '@booking/contracts';
import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../identity-access/infrastructure/http/decorators/public.decorator';
import { toReviewListResponse } from '../../application/review.mapper';
import { ListPublicReviewsUseCase } from '../../application/use-cases/list-public-reviews.use-case';
import { PublicReviewsQueryDto, ReviewListResponseDto } from './dto/review.dto';

@ApiTags('public-reviews')
@Controller('public/reviews')
export class PublicReviewController {
  constructor(private readonly listReviews: ListPublicReviewsUseCase) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List verified reviews for a published listing or group' })
  @ApiOkResponse({ type: ReviewListResponseDto })
  async list(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @Query() query: PublicReviewsQueryDto,
  ): Promise<ReviewListResponse> {
    return toReviewListResponse(
      await this.listReviews.execute(forwardedHost ?? host ?? '', query),
      query,
    );
  }
}
