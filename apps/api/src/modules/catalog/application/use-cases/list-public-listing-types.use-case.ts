import { Injectable, Inject } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
  type ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';

/** Storefront menu: the tenant's active listing types, resolved from the Host. */
@Injectable()
export class ListPublicListingTypesUseCase {
  constructor(
    @Inject(LISTING_TYPE_REPOSITORY) private readonly repo: IListingTypeRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string): Promise<ListingTypeRecord[]> {
    const tenant = await this.resolveTenant.execute(host);
    return this.tenantDb.forTenant(tenant.id, (tx) => this.repo.listActive(tx));
  }
}
