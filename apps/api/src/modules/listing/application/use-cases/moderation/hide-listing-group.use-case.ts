import { Inject, Injectable } from '@nestjs/common';
import type { ModerationActor } from '@booking/contracts';
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
import { transitionHide } from '../../../domain/moderation/listing-moderation';
import { runModeration, type ModerationContext } from '../../moderation/moderation-support';
import {
  runGroupModeration,
  type GroupModerationDeps,
} from '../../moderation/run-group-moderation';

/**
 * Hide a post (listing_group → archived), cascading to every child listing —
 * the group-level mirror of `HideListingUseCase` (§7.3). An admin hide locks
 * the partner out of re-publishing.
 */
@Injectable()
export class HideListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
  ) {}

  execute(
    ctx: ModerationContext,
    id: string,
    actor: ModerationActor,
    reason?: string,
  ): Promise<ListingGroupRecord> {
    return runGroupModeration(
      this.deps(),
      ctx,
      id,
      'hidden',
      'listing_group.hidden',
      (g) => runModeration(() => transitionHide(g, actor)),
      reason,
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
