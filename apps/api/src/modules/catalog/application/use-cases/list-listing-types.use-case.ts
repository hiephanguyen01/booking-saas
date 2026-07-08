import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
  type ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';

@Injectable()
export class ListListingTypesUseCase {
  constructor(
    @Inject(LISTING_TYPE_REPOSITORY) private readonly repo: IListingTypeRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, opts: { includeInactive: boolean }): Promise<ListingTypeRecord[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.repo.list(tx, opts));
  }
}
