import type {
  CustomerReviewListResponse,
  PresignUploadResponse,
  ReviewResponse,
} from '@booking/contracts';
import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { toCustomerReviewListResponse, toReviewResponse } from '../../application/review.mapper';
import { CreateReviewUseCase } from '../../application/use-cases/create-review.use-case';
import { CreateReviewMediaUploadUseCase } from '../../application/use-cases/create-review-media-upload.use-case';
import { ListCustomerReviewsUseCase } from '../../application/use-cases/list-customer-reviews.use-case';
import {
  CreateReviewDto,
  CustomerReviewListResponseDto,
  CustomerReviewsQueryDto,
  ReviewResponseDto,
  ReviewMediaPresignDto,
} from './dto/review.dto';
import { PresignUploadResponseDto } from '../../../storage/infrastructure/http/dto/upload.dto';

@ApiTags('customer-reviews')
@Controller('customer/reviews')
export class CustomerReviewController {
  constructor(
    private readonly listReviews: ListCustomerReviewsUseCase,
    private readonly createReview: CreateReviewUseCase,
    private readonly createReviewMediaUpload: CreateReviewMediaUploadUseCase,
  ) {}

  @AuthenticatedOnly()
  @Get()
  @ApiOperation({ summary: 'List owned completed bookings and submitted reviews' })
  @ApiOkResponse({ type: CustomerReviewListResponseDto })
  async list(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Query() query: CustomerReviewsQueryDto,
  ): Promise<CustomerReviewListResponse> {
    return toCustomerReviewListResponse(
      await this.listReviews.execute(forwardedHost ?? host ?? '', principal.userId, query),
      query,
    );
  }

  @AuthenticatedOnly()
  @Post('media/presign')
  @ApiOperation({ summary: 'Mint a booking-scoped review image or video upload URL' })
  @ApiOkResponse({ type: PresignUploadResponseDto })
  async presignMedia(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: ReviewMediaPresignDto,
  ): Promise<PresignUploadResponse> {
    return this.createReviewMediaUpload.execute(
      forwardedHost ?? host ?? '',
      principal.userId,
      input,
    );
  }

  @AuthenticatedOnly()
  @Post()
  @ApiOperation({ summary: 'Create one review for an owned completed booking' })
  @ApiCreatedResponse({ type: ReviewResponseDto })
  async create(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: CreateReviewDto,
  ): Promise<ReviewResponse> {
    return toReviewResponse(
      await this.createReview.execute(forwardedHost ?? host ?? '', principal.userId, input),
    );
  }
}
