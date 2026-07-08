import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
} from '../../domain/ports/listing-type-repository.port';

/** Delete a listing type; blocked while any listing still references it (§7.3). */
@Injectable()
export class DeleteListingTypeUseCase {
  constructor(
    @Inject(LISTING_TYPE_REPOSITORY) private readonly repo: IListingTypeRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, id: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.repo.findById(tx, id);
      if (!existing) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_TYPE_NOT_FOUND',
          message: 'Listing type not found',
        });
      }
      const inUse = await this.repo.countListingsOfType(tx, id);
      if (inUse > 0) {
        throw new ConflictException({
          statusCode: 409,
          code: 'LISTING_TYPE_IN_USE',
          message: `Cannot delete a listing type with ${inUse} listing(s); deactivate it instead`,
        });
      }
      await this.repo.delete(tx, id);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_type.deleted',
        payload: { listingTypeId: id },
      });
    });
  }
}
