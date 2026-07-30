import type { ModerationActor } from '@booking/contracts';
import type { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import { Listing } from '../../domain/entities/listing.entity';
import { ListingGroup } from '../../domain/entities/listing-group.entity';
import { ListingGroupEmpty } from '../../domain/errors/listing-group-errors';
import { ListingStateChanged } from '../../domain/errors/listing-errors';
import {
  groupNotFound,
  stampModerationTimestamps,
  writeModerationAudit,
  type ModerationContext,
} from './moderation-support';

/** The ports + shared infra every group-moderation use case injects and hands in. */
export interface GroupModerationDeps {
  groups: IListingGroupRepository;
  listings: IListingRepository;
  tenantDb: TenantDbService;
  outbox: OutboxService;
  audit: IAuditWriter;
}

/**
 * Shared transaction body for post-level moderation (§7.3): load → transition →
 * persist → cascade to children → audit → outbox. A `listing_group` is the
 * moderated unit for grouped listings — it mirrors listing moderation and reuses
 * the same pure transitions, so the admin-hide lockout applies to posts too.
 * Plain function (no DI); the submit/publish/hide/republish use cases supply
 * their injected deps and the group-level transition.
 */
export function runGroupModeration(
  deps: GroupModerationDeps,
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
  return deps.tenantDb.forTenant(ctx.tenantId, async (tx) => {
    const group = await deps.groups.findById(tx, id);
    if (!group) groupNotFound();
    const groupAggregate = ListingGroup.rehydrate(group);
    groupAggregate.assertOwnedForModeration(ctx.partnerId);
    const children = await deps.listings.list(tx, {
      groupId: group.id,
      partnerId: group.partnerId,
    });
    if (action === 'submitted' && children.length === 0) {
      throw new ListingGroupEmpty();
    }
    const outcome = transition(group, children);
    const updated = await deps.groups.moderate(tx, id, group.status, outcome);
    if (!updated) throw new ListingStateChanged();
    for (const child of children) {
      const childAggregate = Listing.rehydrate(child);
      // The children follow the post's OUTCOME, not the action name: un-hiding a
      // post that never passed review lands in `pending_review`, and its items
      // must queue up with it rather than go live on their own.
      const childOutcome =
        outcome.status === 'pending_review'
          ? childAggregate.submit()
          : action === 'published'
            ? childAggregate.publish('admin')
            : action === 'hidden'
              ? childAggregate.hide(actorFromOutcome(outcome))
              : childAggregate.republish(actorFromOutcome(outcome));
      const updatedChild = await deps.listings.moderate(
        tx,
        child.id,
        child.status,
        stampModerationTimestamps(child, childOutcome),
      );
      if (!updatedChild) throw new ListingStateChanged();
    }
    await writeModerationAudit(deps.audit, tx, ctx, {
      action: `listing_group.${action}`,
      entityType: 'listing_group',
      entityId: group.id,
      fromStatus: group.status,
      toStatus: outcome.status,
      reason,
    });
    await deps.outbox.emit(tx, { tenantId: ctx.tenantId, eventType, payload: { groupId: id } });
    return updated;
  });
}

function actorFromOutcome(outcome: {
  publishedBy: ModerationActor | null;
  hiddenBy: ModerationActor | null;
}): ModerationActor {
  return outcome.hiddenBy ?? outcome.publishedBy ?? 'partner';
}
