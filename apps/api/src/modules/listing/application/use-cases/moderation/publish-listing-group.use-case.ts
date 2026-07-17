import { BadRequestException, Inject, Injectable } from '@nestjs/common';
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
import { transitionPublish } from '../../../domain/moderation/listing-moderation';
import { groupContactFlags } from '../../moderation/build-listing-group-review';
import { runModeration, type ModerationContext } from '../../moderation/moderation-support';
import {
  runGroupModeration,
  type GroupModerationDeps,
} from '../../moderation/run-group-moderation';

/**
 * A tenant reviewer publishes a post (listing_group) — the group-level mirror of
 * `PublishListingUseCase` (§7.3). Publishing a post publishes every child
 * listing with it, so the contact-info gate MUST cover the children's text too —
 * scanning only the post's own title/description would let a partner smuggle a
 * phone number into an item's description and have it published, bypassing the
 * gate the per-listing publish path enforces.
 */
@Injectable()
export class PublishListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
  ) {}

  execute(ctx: ModerationContext, id: string, force = false): Promise<ListingGroupRecord> {
    return runGroupModeration(
      this.deps(),
      ctx,
      id,
      'published',
      'listing_group.published',
      (g, children) => {
        const flags = groupContactFlags(g, children);
        if (!force && flags.length > 0) {
          throw new BadRequestException({
            statusCode: 400,
            code: 'LISTING_HAS_CONTACT_INFO',
            message: 'Remove contact information from the post and its items before publishing',
            details: flags,
          });
        }
        return runModeration(() => transitionPublish(g, 'admin'));
      },
      force ? 'force-published: contact-info gate bypassed' : undefined,
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
