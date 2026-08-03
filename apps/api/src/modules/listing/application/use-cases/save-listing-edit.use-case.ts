import { Inject, Injectable } from '@nestjs/common';
import type { UpdateListingInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../domain/ports/listing-repository.port';
import {
  LISTING_REVISION_REPOSITORY,
  type IListingRevisionRepository,
} from '../../domain/ports/listing-revision-repository.port';
import { Listing } from '../../domain/entities/listing.entity';
import { ListingNotFound } from '../../domain/errors/listing-errors';
import { ApplyListingUpdateUseCase } from './apply-listing-update.use-case';

export interface SaveListingEditResult {
  listing: ListingRecord;
  /** True when the edit was parked for review instead of written to the listing. */
  parkedForReview: boolean;
}

/**
 * A partner saving the listing edit form (§7.3).
 *
 * A listing nobody has reviewed yet (`draft`) is written in place — there is no
 * live version to protect. Anything that has been through review keeps serving
 * its approved content, and the edit is parked as the target's single pending
 * revision, which IS the submission: no separate "submit" step, and no hiding the
 * listing first. Saving again overwrites that revision.
 */
@Injectable()
export class SaveListingEditUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_REVISION_REPOSITORY)
    private readonly revisions: IListingRevisionRepository,
    private readonly applyUpdate: ApplyListingUpdateUseCase,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    input: UpdateListingInput,
    ctx: { partnerId?: string; actorUserId: string | null },
  ): Promise<SaveListingEditResult> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.listings.findById(tx, id);
      if (!existing) throw new ListingNotFound();
      Listing.rehydrate(existing).assertOwnedForEdit(ctx.partnerId);

      if (existing.status === 'draft') {
        const listing = await this.applyUpdate.execute(tx, tenantId, id, input, {
          requirePartnerId: ctx.partnerId,
          modeConfigValidation: 'draft',
        });
        return { listing, parkedForReview: false };
      }
      // An empty patch changes nothing; parking it would put an empty card in the
      // reviewer's queue and block re-publishing for no reason.
      if (Object.keys(input).length === 0) {
        return { listing: existing, parkedForReview: false };
      }

      const revision = await this.revisions.upsertPending(tx, tenantId, {
        targetType: 'listing',
        targetId: id,
        payload: input as Record<string, unknown>,
        submittedByUserId: ctx.actorUserId,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing.revision_submitted',
        payload: { listingId: id, revisionId: revision.id },
      });
      return { listing: existing, parkedForReview: true };
    });
  }
}
