import type { ListingTypeResponse } from '@booking/contracts';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toListingTypeResponse } from '../../application/catalog.mapper';
import { ListListingTypesUseCase } from '../../application/use-cases/list-listing-types.use-case';
import { ListingTypeResponseDto } from './dto/catalog.dto';

/**
 * Partner read-only access to the tenant's listing types (§7.3) — the partner
 * listing create/edit form needs each type's `allowedModes` + `attributeSchema`.
 * Scope via x-tenant-id + x-partner-id; active types only.
 */
@ApiTags('partner-listing-types')
@Controller('partner/listing-types')
export class PartnerListingTypeController {
  constructor(
    private readonly listListingTypes: ListListingTypesUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.listings.read')
  @Get()
  @ApiOperation({ summary: "List the tenant's active listing types (partner view)" })
  @ApiOkResponse({ type: [ListingTypeResponseDto] })
  async list(): Promise<ListingTypeResponse[]> {
    const items = await this.listListingTypes.execute(this.tenantContext.tenantIdOrThrow(), {
      includeInactive: false,
    });
    return items.map(toListingTypeResponse);
  }
}
