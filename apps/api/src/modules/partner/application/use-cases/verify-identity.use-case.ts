import { Inject, Injectable } from '@nestjs/common';
import type { VerifyIdentityInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { Partner } from '../../domain/entities/partner.entity';
import {
  MissingDob,
  NameMismatch,
  NoPendingIdentity,
  PartnerNotFound,
  Under18,
} from '../../domain/errors/partner-errors';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';

export interface VerifyContext {
  userId: string;
}

/**
 * Tenant admin's manual identity review (§7.3). Verifies the partner unless the
 * DOB shows under-18 (hard block for people-booking types) or the ID holder name
 * does not match the payout account name — both persist a `rejected` state and
 * then fail the request with the reason code.
 */
@Injectable()
export class VerifyIdentityUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    partnerId: string,
    input: VerifyIdentityInput,
    ctx: VerifyContext,
  ): Promise<PartnerRecord> {
    // The pending gate and the state transition run in ONE tx (with a row lock in
    // findByIdForUpdate): two concurrent reviews can't both pass the `pending`
    // check and both write a decision. The `rejected` decision must persist even
    // though we then fail the request, so we commit inside the tx and translate
    // the outcome into an HTTP error afterwards (throwing here would roll it back).
    const outcome = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const state = await this.partners.findByIdForUpdate(tx, partnerId);
      if (!state) return { kind: 'not_found' as const };

      const partner = Partner.rehydrate(state);
      const review = partner.reviewIdentity({
        reviewedBy: ctx.userId,
        note: input.note,
        now: new Date(),
      });

      if (review.kind === 'rejected') {
        await this.partners.updateIdentityReview(tx, partnerId, review.intent);
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'partner.verification_rejected',
          payload: { partnerId, reason: review.reason },
        });
        return review;
      }
      if (review.kind !== 'eligible') return review;

      const verifiedIntent = partner.verifyIdentity({
        reviewedBy: ctx.userId,
        note: input.note,
        verifiedAt: new Date(),
      });
      const updated = await this.partners.updateIdentityReview(tx, partnerId, verifiedIntent);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.verified',
        payload: { partnerId },
      });
      return { kind: 'verified' as const, partner: updated };
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new PartnerNotFound();
      case 'no_pending':
        throw new NoPendingIdentity();
      case 'missing_dob':
        throw new MissingDob();
      case 'rejected':
        if (outcome.reason === 'UNDER_18') throw new Under18();
        throw new NameMismatch();
      case 'verified':
        return outcome.partner;
    }
  }
}
