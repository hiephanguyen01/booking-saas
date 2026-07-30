import { Injectable } from '@nestjs/common';
import type { UpdateListingGroupInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { ListingGroupRecord } from '../../domain/ports/listing-group-repository.port';
import { ApplyListingGroupUpdateUseCase } from './apply-listing-group-update.use-case';

/**
 * Write a post's content update straight onto the row — the path for a post that
 * has never been reviewed and for tenant-side edits. A partner editing an
 * already-reviewed post goes through {@link SaveListingGroupEditUseCase}, which
 * parks the change for review instead.
 */
@Injectable()
export class UpdateListingGroupUseCase {
  constructor(
    private readonly applyUpdate: ApplyListingGroupUpdateUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    input: UpdateListingGroupInput,
    options: { requirePartnerId?: string } = {},
  ): Promise<ListingGroupRecord> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.applyUpdate.execute(tx, tenantId, id, input, options),
    );
  }
}
