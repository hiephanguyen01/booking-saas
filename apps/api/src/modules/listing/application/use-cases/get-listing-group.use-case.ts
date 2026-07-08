import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
  type ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';

@Injectable()
export class GetListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly repo: IListingGroupRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string): Promise<ListingGroupRecord> {
    const group = await this.tenantDb.forTenant(tenantId, (tx) => this.repo.findById(tx, id));
    if (!group) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'LISTING_GROUP_NOT_FOUND',
        message: 'Listing group not found',
      });
    }
    return group;
  }
}
