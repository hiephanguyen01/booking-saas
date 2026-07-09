import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../domain/ports/listing-repository.port';

@Injectable()
export class ListListingsUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, filter: { groupId?: string; partnerId?: string }): Promise<ListingRecord[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.listings.list(tx, filter));
  }
}
