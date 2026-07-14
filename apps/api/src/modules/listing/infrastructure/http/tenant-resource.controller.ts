import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type ResourceResponse } from '@booking/shared';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { CreateResourceUseCase } from '../../application/use-cases/create-resource.use-case';
import { ListResourcesUseCase } from '../../application/use-cases/list-resources.use-case';
import { toResourceResponse } from '../../application/listing.mapper';
import { CreateResourceDto, ResourceResponseDto } from './dto/listing.dto';

@ApiTags('tenant-resources')
@Controller('tenant/resources')
export class TenantResourceController {
  constructor(
    private readonly createResource: CreateResourceUseCase,
    private readonly listResources: ListResourcesUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.listings.read')
  @Get()
  @ApiOperation({ summary: 'List the tenant\'s bookable resources' })
  @ApiOkResponse({ type: [ResourceResponseDto] })
  async list(): Promise<ResourceResponse[]> {
    const items = await this.listResources.execute(this.tenantContext.tenantIdOrThrow());
    return items.map(toResourceResponse);
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  @ApiOperation({ summary: 'Create a bookable resource' })
  @ApiCreatedResponse({ type: ResourceResponseDto })
  async create(
    @Body() input: CreateResourceDto,
  ): Promise<ResourceResponse> {
    return toResourceResponse(
      await this.createResource.execute(this.tenantContext.tenantIdOrThrow(), input),
    );
  }
}
