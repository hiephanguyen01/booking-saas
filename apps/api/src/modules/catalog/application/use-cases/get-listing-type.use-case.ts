import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ListingTypeNotFound } from '../../domain/errors/listing-type-errors';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
  type ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';

@Injectable()
export class GetListingTypeUseCase {
  constructor(
    @Inject(LISTING_TYPE_REPOSITORY) private readonly repo: IListingTypeRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string): Promise<ListingTypeRecord> {
    const type = await this.tenantDb.forTenant(tenantId, (tx) => this.repo.findById(tx, id));
    if (!type) throw new ListingTypeNotFound();
    return type;
  }
}
