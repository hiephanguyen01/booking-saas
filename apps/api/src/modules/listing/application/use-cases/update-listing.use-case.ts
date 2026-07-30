import { Injectable } from '@nestjs/common';
import type { UpdateListingInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { ListingRecord } from '../../domain/ports/listing-repository.port';
import { ApplyListingUpdateUseCase } from './apply-listing-update.use-case';

/**
 * Write a content update straight onto the listing — one transaction per business
 * operation. This is the path for a listing that has never been reviewed and for
 * tenant-side edits; a partner editing an already-reviewed listing goes through
 * {@link SaveListingEditUseCase} instead, which parks the change for review.
 */
@Injectable()
export class UpdateListingUseCase {
  constructor(
    private readonly applyUpdate: ApplyListingUpdateUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    input: UpdateListingInput,
    opts?: { requirePartnerId?: string },
  ): Promise<ListingRecord> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.applyUpdate.execute(tx, tenantId, id, input, opts),
    );
  }
}
