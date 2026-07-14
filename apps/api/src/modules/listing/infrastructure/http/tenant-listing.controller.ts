import { uuidSchema, type ListingResponse } from '@booking/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { EnforcePlanLimit } from '../../../tenancy/infrastructure/http/decorators/enforce-plan-limit.decorator';
import { PlanLimitGuard } from '../../../tenancy/infrastructure/http/guards/plan-limit.guard';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { toListingResponse } from '../../application/listing.mapper';
import { CreateListingUseCase } from '../../application/use-cases/create-listing.use-case';
import { DeleteListingUseCase } from '../../application/use-cases/delete-listing.use-case';
import { GetListingUseCase } from '../../application/use-cases/get-listing.use-case';
import { ListListingsUseCase } from '../../application/use-cases/list-listings.use-case';
import { UpdateListingUseCase } from '../../application/use-cases/update-listing.use-case';
import { CreateListingDto, ListingResponseDto, UpdateListingDto } from './dto/listing.dto';

@ApiTags('tenant-listings')
@Controller('tenant/listings')
export class TenantListingController {
  constructor(
    private readonly createListing: CreateListingUseCase,
    private readonly listListings: ListListingsUseCase,
    private readonly getListing: GetListingUseCase,
    private readonly updateListing: UpdateListingUseCase,
    private readonly deleteListing: DeleteListingUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.listings.read')
  @Get()
  @ApiOperation({ summary: "List the tenant's listings" })
  @ApiQuery({ name: 'groupId', required: false, type: 'string' })
  @ApiOkResponse({ type: [ListingResponseDto] })
  async list(@Query('groupId') groupId?: string): Promise<ListingResponse[]> {
    const items = await this.listListings.execute(this.tenantContext.tenantIdOrThrow(), {
      groupId,
    });
    return items.map(toListingResponse);
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard, PlanLimitGuard)
  @EnforcePlanLimit('listing')
  @Post()
  @ApiOperation({ summary: 'Create a listing' })
  @ApiCreatedResponse({ type: ListingResponseDto })
  async create(@Body() input: CreateListingDto): Promise<ListingResponse> {
    return toListingResponse(
      await this.createListing.execute(this.tenantContext.tenantIdOrThrow(), input),
    );
  }

  @RequirePermissions('tenant.listings.read')
  @Get(':id')
  @ApiOperation({ summary: 'Get a listing by id' })
  @UuidParam()
  @ApiOkResponse({ type: ListingResponseDto })
  async get(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<ListingResponse> {
    return toListingResponse(
      await this.getListing.execute(this.tenantContext.tenantIdOrThrow(), id),
    );
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a listing' })
  @UuidParam()
  @ApiOkResponse({ type: ListingResponseDto })
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: UpdateListingDto,
  ): Promise<ListingResponse> {
    return toListingResponse(
      await this.updateListing.execute(this.tenantContext.tenantIdOrThrow(), id, input),
    );
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a listing' })
  @UuidParam()
  @ApiNoContentResponse()
  async remove(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    await this.deleteListing.execute(this.tenantContext.tenantIdOrThrow(), id);
  }
}
