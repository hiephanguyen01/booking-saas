import {
  uuidSchema,
  type ListingGroupDetailResponse,
  type ListingGroupResponse,
  type Paginated,
} from '@booking/contracts';
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
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { ApiPaginatedResponse, UuidParam } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { PaginationQueryDto } from '../../../../shared/pagination/pagination.dto';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { CreateListingGroupUseCase } from '../../application/use-cases/create-listing-group.use-case';
import { DeleteListingGroupUseCase } from '../../application/use-cases/delete-listing-group.use-case';
import { GetListingGroupDetailUseCase } from '../../application/use-cases/get-listing-group-detail.use-case';
import { ListListingGroupsUseCase } from '../../application/use-cases/list-listing-groups.use-case';
import { UpdateListingGroupUseCase } from '../../application/use-cases/update-listing-group.use-case';
import { toListingGroupResponse } from '../../application/listing.mapper';
import {
  CreateListingGroupDto,
  ListingGroupDetailResponseDto,
  ListingGroupResponseDto,
  UpdateListingGroupDto,
} from './dto/listing.dto';

@ApiTags('partner-listing-groups')
@Controller('partner/listing-groups')
export class PartnerListingGroupController {
  constructor(
    private readonly createGroup: CreateListingGroupUseCase,
    private readonly listGroups: ListListingGroupsUseCase,
    private readonly getDetail: GetListingGroupDetailUseCase,
    private readonly updateGroup: UpdateListingGroupUseCase,
    private readonly deleteGroup: DeleteListingGroupUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.listings.read')
  @Get()
  @ApiPaginatedResponse(ListingGroupResponseDto)
  async list(@Query() query: PaginationQueryDto): Promise<Paginated<ListingGroupResponse>> {
    const result = await this.listGroups.execute(
      this.tenantContext.tenantIdOrThrow(),
      { partnerId: this.tenantContext.partnerIdOrThrow() },
      query,
    );
    return toPaginated(query, result, toListingGroupResponse);
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  @ApiCreatedResponse({ type: ListingGroupResponseDto })
  async create(@Body() input: CreateListingGroupDto): Promise<ListingGroupResponse> {
    return toListingGroupResponse(
      await this.createGroup.execute(this.tenantContext.tenantIdOrThrow(), {
        ...input,
        partnerId: this.tenantContext.partnerIdOrThrow(),
      }),
    );
  }

  @RequirePermissions('partner.listings.read')
  @Get(':id')
  @UuidParam()
  @ApiOkResponse({ type: ListingGroupDetailResponseDto })
  get(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<ListingGroupDetailResponse> {
    return this.getDetail.execute(
      this.tenantContext.tenantIdOrThrow(),
      id,
      this.tenantContext.partnerIdOrThrow(),
    );
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id')
  @UuidParam()
  @ApiOkResponse({ type: ListingGroupResponseDto })
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: UpdateListingGroupDto,
  ): Promise<ListingGroupResponse> {
    return toListingGroupResponse(
      await this.updateGroup.execute(this.tenantContext.tenantIdOrThrow(), id, input, {
        requirePartnerId: this.tenantContext.partnerIdOrThrow(),
      }),
    );
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':id')
  @UuidParam()
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    return this.deleteGroup.execute(this.tenantContext.tenantIdOrThrow(), id, {
      requirePartnerId: this.tenantContext.partnerIdOrThrow(),
    });
  }
}
