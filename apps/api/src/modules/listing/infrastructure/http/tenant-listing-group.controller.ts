import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createListingGroupInputSchema,
  updateListingGroupInputSchema,
  uuidSchema,
  type CreateListingGroupInput,
  type ListingGroupResponse,
  type UpdateListingGroupInput,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { CreateListingGroupUseCase } from '../../application/use-cases/create-listing-group.use-case';
import { ListListingGroupsUseCase } from '../../application/use-cases/list-listing-groups.use-case';
import { GetListingGroupUseCase } from '../../application/use-cases/get-listing-group.use-case';
import { UpdateListingGroupUseCase } from '../../application/use-cases/update-listing-group.use-case';
import { DeleteListingGroupUseCase } from '../../application/use-cases/delete-listing-group.use-case';
import { toListingGroupResponse } from '../../application/listing.mapper';

@Controller('tenant/listing-groups')
export class TenantListingGroupController {
  constructor(
    private readonly createGroup: CreateListingGroupUseCase,
    private readonly listGroups: ListListingGroupsUseCase,
    private readonly getGroup: GetListingGroupUseCase,
    private readonly updateGroup: UpdateListingGroupUseCase,
    private readonly deleteGroup: DeleteListingGroupUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.listings.read')
  @Get()
  async list(): Promise<ListingGroupResponse[]> {
    const items = await this.listGroups.execute(this.tenantContext.tenantIdOrThrow());
    return items.map(toListingGroupResponse);
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  async create(
    @Body(new ZodValidationPipe(createListingGroupInputSchema)) input: CreateListingGroupInput,
  ): Promise<ListingGroupResponse> {
    return toListingGroupResponse(
      await this.createGroup.execute(this.tenantContext.tenantIdOrThrow(), input),
    );
  }

  @RequirePermissions('tenant.listings.read')
  @Get(':id')
  async get(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<ListingGroupResponse> {
    return toListingGroupResponse(
      await this.getGroup.execute(this.tenantContext.tenantIdOrThrow(), id),
    );
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id')
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateListingGroupInputSchema)) input: UpdateListingGroupInput,
  ): Promise<ListingGroupResponse> {
    return toListingGroupResponse(
      await this.updateGroup.execute(this.tenantContext.tenantIdOrThrow(), id, input),
    );
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    await this.deleteGroup.execute(this.tenantContext.tenantIdOrThrow(), id);
  }
}
