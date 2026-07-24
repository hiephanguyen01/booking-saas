import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../../shared/outbox/outbox.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
  type ListingGroupRecord,
} from '../../../domain/ports/listing-group-repository.port';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../../domain/ports/listing-repository.port';
import { ListingGroup } from '../../../domain/entities/listing-group.entity';
import type { ModerationContext } from '../../moderation/moderation-support';
import {
  runGroupModeration,
  type GroupModerationDeps,
} from '../../moderation/run-group-moderation';

/**
 * A partner submits a post (listing_group) for tenant review — the group-level
 * mirror of `SubmitListingUseCase` (§7.3). An empty post cannot be submitted,
 * and every child listing enters review with it.
 */
@Injectable()
export class SubmitListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
  ) {}

  execute(ctx: ModerationContext, id: string): Promise<ListingGroupRecord> {
    return runGroupModeration(this.deps(), ctx, id, 'submitted', 'listing_group.submitted', (g) =>
      ListingGroup.rehydrate(g).submit(),
    );
  }

  private deps(): GroupModerationDeps {
    return {
      groups: this.groups,
      listings: this.listings,
      tenantDb: this.tenantDb,
      outbox: this.outbox,
      audit: this.audit,
    };
  }
}
