import { BadRequestException } from '@nestjs/common';
import type { ModerationActor } from '@booking/contracts';
import type { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import type { IListingRepository, ListingRecord } from '../../domain/ports/listing-repository.port';
import {
  transitionHide,
  transitionPublish,
  transitionRepublish,
  transitionSubmit,
} from '../../domain/moderation/listing-moderation';
import {
  assertOwnership,
  groupNotFound,
  runModeration,
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
    assertOwnership(group, ctx.partnerId);
    const children = await deps.listings.list(tx, {
      groupId: group.id,
      partnerId: group.partnerId,
    });
    if (action === 'submitted' && children.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'LISTING_GROUP_EMPTY',
        message: 'Add at least one listing before submitting the group',
      });
    }
    const outcome = transition(group, children);
    const updated = await deps.groups.moderate(tx, id, outcome);
    for (const child of children) {
      const childOutcome =
        action === 'submitted'
          ? runModeration(() => transitionSubmit(child))
          : action === 'published'
            ? runModeration(() => transitionPublish(child, 'admin'))
            : action === 'hidden'
              ? runModeration(() => transitionHide(child, actorFromOutcome(outcome)))
              : runModeration(() => transitionRepublish(child, actorFromOutcome(outcome)));
      await deps.listings.moderate(tx, child.id, stampModerationTimestamps(child, childOutcome));
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
