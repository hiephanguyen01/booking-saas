import { Injectable, Logger } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { evaluateAttribution } from '../../domain/affiliate-attribution';
import { normalizeReferralCode } from '../../domain/referral-code';

export interface AttributionRequest {
  code: string;
  /** The booking's customer user id (real account or just-created guest). */
  customerId: string;
  /** The partner that owns the listing being booked (self-dealing check). */
  listingPartnerId: string;
}

export interface Attribution {
  affiliateId: string;
  referralCode: string;
  /** Whole-percent override of the affiliate rate (§15.2); null = use the rule. */
  customRate: bigint | null;
}

/**
 * Resolve a checkout referral code to an attributable affiliate (§15.1/§15.2).
 * Composed INSIDE the booking module's `forTenant` tx (like promotion application)
 * so attribution commits atomically with the booking. Returns `null` — never
 * throws — on any miss or fraud signal, so an invalid/abusive code silently drops
 * attribution and the booking still succeeds.
 */
@Injectable()
export class ResolveAttributionUseCase {
  private readonly logger = new Logger(ResolveAttributionUseCase.name);

  async execute(tx: PrismaTx, req: AttributionRequest): Promise<Attribution | null> {
    const code = normalizeReferralCode(req.code);
    if (!code) return null;

    const link = await tx.referralLink.findFirst({
      where: { code },
      select: { code: true, affiliate: { select: { id: true, userId: true, status: true, customRate: true } } },
    });
    if (!link || link.affiliate.status !== 'approved') return null;

    const affiliate = link.affiliate;
    const [affiliateUser, customerUser, partnerMember] = await Promise.all([
      tx.user.findUnique({ where: { id: affiliate.userId }, select: { email: true, phone: true } }),
      tx.user.findUnique({ where: { id: req.customerId }, select: { email: true, phone: true } }),
      tx.partnerMember.findFirst({
        where: { partnerId: req.listingPartnerId, userId: affiliate.userId },
        select: { id: true },
      }),
    ]);

    const decision = evaluateAttribution({
      affiliateUserId: affiliate.userId,
      affiliateEmail: affiliateUser?.email ?? null,
      affiliatePhone: affiliateUser?.phone ?? null,
      customerUserId: req.customerId,
      customerEmail: customerUser?.email ?? null,
      customerPhone: customerUser?.phone ?? null,
      affiliateIsPartnerMember: partnerMember !== null,
    });
    if (!decision.ok) {
      this.logger.debug(`referral ${code} dropped: ${decision.rejection}`);
      return null;
    }

    return { affiliateId: affiliate.id, referralCode: link.code, customRate: affiliate.customRate };
  }
}
