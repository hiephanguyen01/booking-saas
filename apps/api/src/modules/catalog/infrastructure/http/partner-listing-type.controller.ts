import { Controller, Get } from '@nestjs/common';
import type { ListingTypeResponse } from '@booking/shared';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { ListListingTypesUseCase } from '../../application/use-cases/list-listing-types.use-case';
import { toListingTypeResponse } from '../../application/catalog.mapper';

/**
 * Partner read-only access to the tenant's listing types (§7.3) — the partner
 * listing create/edit form needs each type's `allowedModes` + `attributeSchema`.
 * Scope via x-tenant-id + x-partner-id; active types only.
 */
@Controller('partner/listing-types')
export class PartnerListingTypeController {
  constructor(
    private readonly listListingTypes: ListListingTypesUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.listings.read')
  @Get()
  async list(): Promise<ListingTypeResponse[]> {
    const items = await this.listListingTypes.execute(this.tenantContext.tenantIdOrThrow(), {
      includeInactive: false,
    });
    return items.map(toListingTypeResponse);
  }
}
