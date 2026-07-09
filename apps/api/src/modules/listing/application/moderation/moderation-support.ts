import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { ModerationError } from '../../domain/moderation/listing-moderation';
import type { ListingRecord } from '../../domain/ports/listing-repository.port';

/** Who is acting + the audit metadata every moderation use case needs. */
export interface ModerationContext {
  tenantId: string;
  actorUserId?: string;
  ip?: string;
  /** Set on partner-scoped calls to enforce that the listing is the partner's own. */
  partnerId?: string;
}

export function listingNotFound(): never {
  throw new NotFoundException({
    statusCode: 404,
    code: 'LISTING_NOT_FOUND',
    message: 'Listing not found',
  });
}

export function assertOwnership(listing: ListingRecord, partnerId?: string): void {
  if (partnerId && listing.partnerId !== partnerId) {
    throw new ForbiddenException({
      statusCode: 403,
      code: 'LISTING_NOT_OWNED',
      message: 'This listing belongs to another partner',
    });
  }
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
  tx: PrismaTx,
  ctx: ModerationContext,
  params: { action: string; listing: ListingRecord; toStatus: string; reason?: string },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId ?? null,
      action: params.action,
      entityType: 'listing',
      entityId: params.listing.id,
      ip: ctx.ip ?? null,
      data: {
        fromStatus: params.listing.status,
        toStatus: params.toStatus,
        reason: params.reason ?? null,
      },
    },
  });
}
