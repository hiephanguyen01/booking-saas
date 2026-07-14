import { uuidSchema, type ListingGroupResponse } from '@booking/contracts';
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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { toListingGroupResponse } from '../../application/listing.mapper';
import { CreateListingGroupUseCase } from '../../application/use-cases/create-listing-group.use-case';
import { DeleteListingGroupUseCase } from '../../application/use-cases/delete-listing-group.use-case';
import { GetListingGroupUseCase } from '../../application/use-cases/get-listing-group.use-case';
import { ListListingGroupsUseCase } from '../../application/use-cases/list-listing-groups.use-case';
import { UpdateListingGroupUseCase } from '../../application/use-cases/update-listing-group.use-case';
import {
  CreateListingGroupDto,
  ListingGroupResponseDto,
  UpdateListingGroupDto,
} from './dto/listing.dto';

@ApiTags('tenant-listing-groups')
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
  @ApiOperation({ summary: "List the tenant's listing groups" })
  @ApiOkResponse({ type: [ListingGroupResponseDto] })
  async list(): Promise<ListingGroupResponse[]> {
    const items = await this.listGroups.execute(this.tenantContext.tenantIdOrThrow());
    return items.map(toListingGroupResponse);
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  @ApiOperation({ summary: 'Create a listing group' })
  @ApiCreatedResponse({ type: ListingGroupResponseDto })
  async create(@Body() input: CreateListingGroupDto): Promise<ListingGroupResponse> {
    return toListingGroupResponse(
      await this.createGroup.execute(this.tenantContext.tenantIdOrThrow(), input),
    );
  }

  @RequirePermissions('tenant.listings.read')
  @Get(':id')
  @ApiOperation({ summary: 'Get a listing group by id' })
  @UuidParam()
  @ApiOkResponse({ type: ListingGroupResponseDto })
  async get(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<ListingGroupResponse> {
    return toListingGroupResponse(
      await this.getGroup.execute(this.tenantContext.tenantIdOrThrow(), id),
    );
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a listing group' })
  @UuidParam()
  @ApiOkResponse({ type: ListingGroupResponseDto })
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: UpdateListingGroupDto,
  ): Promise<ListingGroupResponse> {
    return toListingGroupResponse(
      await this.updateGroup.execute(this.tenantContext.tenantIdOrThrow(), id, input),
    );
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a listing group' })
  @UuidParam()
  @ApiNoContentResponse()
  async remove(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    await this.deleteGroup.execute(this.tenantContext.tenantIdOrThrow(), id);
  }
}
