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
  createListingInputSchema,
  updateListingInputSchema,
  uuidSchema,
  type CreateListingInput,
  type ListingResponse,
  type UpdateListingInput,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { PlanLimitGuard } from '../../../tenancy/infrastructure/http/guards/plan-limit.guard';
import { EnforcePlanLimit } from '../../../tenancy/infrastructure/http/decorators/enforce-plan-limit.decorator';
import { CreateListingUseCase } from '../../application/use-cases/create-listing.use-case';
import { ListListingsUseCase } from '../../application/use-cases/list-listings.use-case';
import { GetListingUseCase } from '../../application/use-cases/get-listing.use-case';
import { UpdateListingUseCase } from '../../application/use-cases/update-listing.use-case';
import { DeleteListingUseCase } from '../../application/use-cases/delete-listing.use-case';
import { toListingResponse } from '../../application/listing.mapper';

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
  async list(@Query('groupId') groupId?: string): Promise<ListingResponse[]> {
    const items = await this.listListings.execute(this.tenantContext.tenantIdOrThrow(), { groupId });
    return items.map(toListingResponse);
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard, PlanLimitGuard)
  @EnforcePlanLimit('listing')
  @Post()
  async create(
    @Body(new ZodValidationPipe(createListingInputSchema)) input: CreateListingInput,
  ): Promise<ListingResponse> {
    return toListingResponse(
      await this.createListing.execute(this.tenantContext.tenantIdOrThrow(), input),
    );
  }

  @RequirePermissions('tenant.listings.read')
  @Get(':id')
  async get(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<ListingResponse> {
    return toListingResponse(await this.getListing.execute(this.tenantContext.tenantIdOrThrow(), id));
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id')
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateListingInputSchema)) input: UpdateListingInput,
  ): Promise<ListingResponse> {
    return toListingResponse(
      await this.updateListing.execute(this.tenantContext.tenantIdOrThrow(), id, input),
    );
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    await this.deleteListing.execute(this.tenantContext.tenantIdOrThrow(), id);
  }
}
