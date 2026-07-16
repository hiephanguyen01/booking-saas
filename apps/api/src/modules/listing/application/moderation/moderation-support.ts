import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { ModerationError, type ModerationOutcome } from '../../domain/moderation/listing-moderation';
import type { ModerationUpdate } from '../../domain/ports/listing-repository.port';

/** Who is acting + the audit metadata every moderation use case needs. */
export interface ModerationContext {
  tenantId: string;
  actorUserId?: string;
  ip?: string;
  /** Set on partner-scoped calls to enforce that the entity is the partner's own. */
  partnerId?: string;
}

/** Minimal shape a moderatable record (listing or group) exposes. */
interface OwnedRecord {
  partnerId: string;
}

export function listingNotFound(): never {
  throw new NotFoundException({
    statusCode: 404,
    code: 'LISTING_NOT_FOUND',
    message: 'Listing not found',
  });
}

export function groupNotFound(): never {
  throw new NotFoundException({
    statusCode: 404,
    code: 'LISTING_GROUP_NOT_FOUND',
    message: 'Listing group not found',
  });
}

export function assertOwnership(record: OwnedRecord, partnerId?: string): void {
  if (partnerId && record.partnerId !== partnerId) {
    throw new ForbiddenException({
      statusCode: 403,
      code: 'NOT_OWNED',
      message: 'This resource belongs to another partner',
    });
  }
}

/** The listing timestamps a moderation transition may stamp. */
interface TimestampedRecord {
  publishedAt: Date | null;
}

/**
 * Turn a pure `ModerationOutcome` into the persisted update, stamping the
 * moderation milestones the pure transitions can't (they have no clock):
 *
 * - `submittedAt` — every entry into `pending_review`, so a reviewer can see how
 *   long a listing has been waiting (a resubmission legitimately resets it).
 * - `publishedAt` — only the FIRST time the listing reaches `published`. The
 *   column means "first published", and per the schema comment it must survive a
 *   later archive/hide, so a republish must not overwrite it.
 *
 * Any other transition leaves both untouched (`undefined` → column omitted).
 */
export function stampModerationTimestamps(
  record: TimestampedRecord,
  outcome: ModerationOutcome,
  now: Date = new Date(),
): ModerationUpdate {
  return {
    ...outcome,
    submittedAt: outcome.status === 'pending_review' ? now : undefined,
    publishedAt: outcome.status === 'published' && record.publishedAt === null ? now : undefined,
  };
}

/** Map a pure-domain ModerationError onto the right HTTP status. */
export function runModeration<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ModerationError) {
      const payload = { statusCode: 0, code: err.code, message: err.message };
      if (err.code === 'LISTING_ADMIN_LOCKED') {
        throw new ForbiddenException({ ...payload, statusCode: 403 });
      }
      throw new BadRequestException({ ...payload, statusCode: 400 });
    }
    throw err;
  }
}

/** Append a moderation action to the audit log inside the same tx (§14.4). */
export async function writeModerationAudit(
  audit: IAuditWriter,
  tx: PrismaTx,
  ctx: ModerationContext,
  params: {
    action: string;
    entityType: 'listing' | 'listing_group';
    entityId: string;
    fromStatus: string;
    toStatus: string;
    reason?: string;
  },
): Promise<void> {
  await audit.write(tx, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId ?? null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    ip: ctx.ip ?? null,
    data: {
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      reason: params.reason ?? null,
    },
  });
}
