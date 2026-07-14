import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  createResourceInputSchema,
  type CreateResourceInput,
  type ResourceResponse,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { CreateResourceUseCase } from '../../application/use-cases/create-resource.use-case';
import { ListResourcesUseCase } from '../../application/use-cases/list-resources.use-case';
import { toResourceResponse } from '../../application/listing.mapper';

@Controller('tenant/resources')
export class TenantResourceController {
  constructor(
    private readonly createResource: CreateResourceUseCase,
    private readonly listResources: ListResourcesUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.listings.read')
  @Get()
  async list(): Promise<ResourceResponse[]> {
    const items = await this.listResources.execute(this.tenantContext.tenantIdOrThrow());
    return items.map(toResourceResponse);
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  async create(
    @Body(new ZodValidationPipe(createResourceInputSchema)) input: CreateResourceInput,
  ): Promise<ResourceResponse> {
    return toResourceResponse(
      await this.createResource.execute(this.tenantContext.tenantIdOrThrow(), input),
    );
  }
}
