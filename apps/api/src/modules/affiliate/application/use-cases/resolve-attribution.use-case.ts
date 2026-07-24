import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { evaluateAttribution } from '../../domain/affiliate-attribution';
import {
  AFFILIATE_ATTRIBUTION_READER,
  type IAffiliateAttributionReader,
} from '../../domain/ports/affiliate-attribution-reader.port';
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

  constructor(
    @Inject(AFFILIATE_ATTRIBUTION_READER)
    private readonly attributionReader: IAffiliateAttributionReader,
  ) {}

  async execute(tx: PrismaTx, req: AttributionRequest): Promise<Attribution | null> {
    const code = normalizeReferralCode(req.code);
    if (!code) return null;

    const candidate = await this.attributionReader.findApprovedCandidate(tx, code);
    if (!candidate) return null;

    const [affiliateUser, customerUser, affiliateIsPartnerMember] = await Promise.all([
      this.attributionReader.findUserContact(tx, candidate.affiliateUserId),
      this.attributionReader.findUserContact(tx, req.customerId),
      this.attributionReader.isPartnerMember(
        tx,
        req.listingPartnerId,
        candidate.affiliateUserId,
      ),
    ]);

    const decision = evaluateAttribution({
      affiliateUserId: candidate.affiliateUserId,
      affiliateEmail: affiliateUser?.email ?? null,
      affiliatePhone: affiliateUser?.phone ?? null,
      customerUserId: req.customerId,
      customerEmail: customerUser?.email ?? null,
      customerPhone: customerUser?.phone ?? null,
      affiliateIsPartnerMember,
    });
    if (!decision.ok) {
      this.logger.debug(`referral ${code} dropped: ${decision.rejection}`);
      return null;
    }

    return {
      affiliateId: candidate.affiliateId,
      referralCode: candidate.referralCode,
      customRate: candidate.customRate,
    };
  }
}
