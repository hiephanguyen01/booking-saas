import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ModerationActor } from '@booking/contracts';
import {
  TenantDbService,
  type PrismaTx,
} from '../../../../../shared/tenant-context/tenant-db.service';
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
  type ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import {
  transitionHide,
  transitionPublish,
  transitionRepublish,
  transitionSubmit,
} from '../../../domain/moderation/listing-moderation';
import { groupContactFlags } from '../../moderation/build-listing-group-review';
import {
  assertOwnership,
  groupNotFound,
  runModeration,
  stampModerationTimestamps,
  writeModerationAudit,
  type ModerationContext,
} from '../../moderation/moderation-support';

/**
 * Post-level moderation (§7.3): a `listing_group` is the moderated unit for
 * grouped listings. Mirrors listing moderation and reuses the same pure
 * transitions, so the admin-hide lockout applies to posts too.
 */
@Injectable()
export class GroupModerationUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
  ) {}

  private async load(tx: PrismaTx, id: string): Promise<ListingGroupRecord> {
    const group = await this.groups.findById(tx, id);
    if (!group) groupNotFound();
    return group;
  }

  private async children(tx: PrismaTx, group: ListingGroupRecord): Promise<ListingRecord[]> {
    return this.listings.list(tx, { groupId: group.id, partnerId: group.partnerId });
  }

  submit(ctx: ModerationContext, id: string): Promise<ListingGroupRecord> {
    return this.run(ctx, id, 'submitted', 'listing_group.submitted', (g) =>
      runModeration(() => transitionSubmit(g)),
    );
  }

  /**
   * Publishing a post publishes every child listing with it, so the contact-info
   * gate (§7.3) MUST cover the children's text too — scanning only the post's own
   * title/description would let a partner smuggle a phone number into an item's
   * description and have it published, bypassing the gate the per-listing publish
   * path enforces.
   */
  publish(ctx: ModerationContext, id: string, force = false): Promise<ListingGroupRecord> {
    return this.run(
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

  hide(
    ctx: ModerationContext,
    id: string,
    actor: ModerationActor,
    reason?: string,
  ): Promise<ListingGroupRecord> {
    return this.run(
      ctx,
      id,
      'hidden',
      'listing_group.hidden',
      (g) => runModeration(() => transitionHide(g, actor)),
      reason,
    );
  }

  republish(
    ctx: ModerationContext,
    id: string,
    actor: ModerationActor,
  ): Promise<ListingGroupRecord> {
    return this.run(ctx, id, 'republished', 'listing_group.published', (g) =>
      runModeration(() => transitionRepublish(g, actor)),
    );
  }

  /** Shared transaction body: load → transition → persist → audit → outbox. */
  private run(
    ctx: ModerationContext,
    id: string,
    action: string,
    eventType: string,
    transition: (
      g: ListingGroupRecord,
      children: ListingRecord[],
    ) => {
      status: 'draft' | 'pending_review' | 'published' | 'archived';
      publishedBy: ModerationActor | null;
      hiddenBy: ModerationActor | null;
    },
    reason?: string,
  ): Promise<ListingGroupRecord> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const group = await this.load(tx, id);
      assertOwnership(group, ctx.partnerId);
      const children = await this.children(tx, group);
      if (action === 'submitted' && children.length === 0) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'LISTING_GROUP_EMPTY',
          message: 'Add at least one listing before submitting the group',
        });
      }
      const outcome = transition(group, children);
      const updated = await this.groups.moderate(tx, id, outcome);
      for (const child of children) {
        const childOutcome =
          action === 'submitted'
            ? runModeration(() => transitionSubmit(child))
            : action === 'published'
              ? runModeration(() => transitionPublish(child, 'admin'))
              : action === 'hidden'
                ? runModeration(() => transitionHide(child, actorFromOutcome(outcome)))
                : runModeration(() => transitionRepublish(child, actorFromOutcome(outcome)));
        await this.listings.moderate(tx, child.id, stampModerationTimestamps(child, childOutcome));
      }
      await writeModerationAudit(this.audit, tx, ctx, {
        action: `listing_group.${action}`,
        entityType: 'listing_group',
        entityId: group.id,
        fromStatus: group.status,
        toStatus: outcome.status,
        reason,
      });
      await this.outbox.emit(tx, { tenantId: ctx.tenantId, eventType, payload: { groupId: id } });
      return updated;
    });
  }
}

function actorFromOutcome(outcome: {
  publishedBy: ModerationActor | null;
  hiddenBy: ModerationActor | null;
}): ModerationActor {
  return outcome.hiddenBy ?? outcome.publishedBy ?? 'partner';
}
