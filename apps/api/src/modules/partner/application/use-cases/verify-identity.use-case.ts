import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { VerifyIdentityInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { isAdult, nameMatches } from '../../domain/partner-verification';
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
      const partner = await this.partners.findByIdForUpdate(tx, partnerId);
      if (!partner) return { kind: 'not_found' as const };
      if (partner.verificationStatus !== 'pending') return { kind: 'no_pending' as const };
      if (!partner.dateOfBirth) return { kind: 'missing_dob' as const };

      const idHolderName = (partner.identityInfo as { holderName?: string }).holderName ?? '';
      const payoutHolderName = (partner.payoutInfo as { holderName?: string }).holderName ?? '';
      const reason = !isAdult(partner.dateOfBirth, new Date())
        ? 'UNDER_18'
        : !nameMatches(idHolderName, payoutHolderName)
          ? 'NAME_MISMATCH'
          : null;

      if (reason) {
        await this.partners.update(tx, partnerId, {
          verificationStatus: 'rejected',
          identityInfo: {
            ...partner.identityInfo,
            reviewedBy: ctx.userId,
            reviewNote: input.note ?? reason,
          },
        });
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'partner.verification_rejected',
          payload: { partnerId, reason },
        });
        return { kind: 'rejected' as const, reason };
      }

      const updated = await this.partners.update(tx, partnerId, {
        verificationStatus: 'verified',
        verifiedAt: new Date(),
        identityInfo: {
          ...partner.identityInfo,
          reviewedBy: ctx.userId,
          reviewNote: input.note ?? null,
        },
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.verified',
        payload: { partnerId },
      });
      return { kind: 'verified' as const, partner: updated };
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new NotFoundException({
          statusCode: 404,
          code: 'PARTNER_NOT_FOUND',
          message: 'Partner not found',
        });
      case 'no_pending':
        throw new ConflictException({
          statusCode: 409,
          code: 'NO_PENDING_IDENTITY',
          message: 'There is no pending identity submission to review',
        });
      case 'missing_dob':
        throw new BadRequestException({
          statusCode: 400,
          code: 'MISSING_DOB',
          message: 'Identity submission is missing a date of birth',
        });
      case 'rejected':
        throw new ForbiddenException({
          statusCode: 403,
          code: outcome.reason,
          message:
            outcome.reason === 'UNDER_18'
              ? 'Partner is under 18 — cannot verify for people-booking listing types'
              : 'ID holder name does not match the payout account holder name',
        });
      case 'verified':
        return outcome.partner;
    }
  }
}
