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
  createListingTypeInputSchema,
  updateListingTypeInputSchema,
  uuidSchema,
  type CreateListingTypeInput,
  type ListingTypeResponse,
  type UpdateListingTypeInput,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { CreateListingTypeUseCase } from '../../application/use-cases/create-listing-type.use-case';
import { ListListingTypesUseCase } from '../../application/use-cases/list-listing-types.use-case';
import { GetListingTypeUseCase } from '../../application/use-cases/get-listing-type.use-case';
import { UpdateListingTypeUseCase } from '../../application/use-cases/update-listing-type.use-case';
import { DeleteListingTypeUseCase } from '../../application/use-cases/delete-listing-type.use-case';
import { toListingTypeResponse } from '../../application/catalog.mapper';

/** Tenant-admin listing-type CRUD (§7.3), scope via x-tenant-id. */
@Controller('tenant/listing-types')
export class TenantListingTypeController {
  constructor(
    private readonly createListingType: CreateListingTypeUseCase,
    private readonly listListingTypes: ListListingTypesUseCase,
    private readonly getListingType: GetListingTypeUseCase,
    private readonly updateListingType: UpdateListingTypeUseCase,
    private readonly deleteListingType: DeleteListingTypeUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.listings.read')
  @Get()
  async list(
    @Query('includeInactive') includeInactive?: string,
  ): Promise<ListingTypeResponse[]> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const items = await this.listListingTypes.execute(tenantId, {
      includeInactive: includeInactive === 'true',
    });
    return items.map(toListingTypeResponse);
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  async create(
    @Body(new ZodValidationPipe(createListingTypeInputSchema)) input: CreateListingTypeInput,
  ): Promise<ListingTypeResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return toListingTypeResponse(await this.createListingType.execute(tenantId, input));
  }

  @RequirePermissions('tenant.listings.read')
  @Get(':id')
  async get(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<ListingTypeResponse> {
    return toListingTypeResponse(
      await this.getListingType.execute(this.tenantContext.tenantIdOrThrow(), id),
    );
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id')
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateListingTypeInputSchema)) input: UpdateListingTypeInput,
  ): Promise<ListingTypeResponse> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return toListingTypeResponse(await this.updateListingType.execute(tenantId, id, input));
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    await this.deleteListingType.execute(this.tenantContext.tenantIdOrThrow(), id);
  }
}
