import { Inject, Injectable } from '@nestjs/common';
import {
  noWithholding,
  partnerIsWithheld,
  selectWithholdingRate,
  type WithholdingSnapshot,
} from '../../../../shared/domain/tax/withholding';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  WITHHOLDING_RATE_REPOSITORY,
  type IWithholdingRateRepository,
} from '../../domain/ports/withholding-rate-repository.port';

export interface ResolveWithholdingTarget {
  partnerId: string;
  /** Service delivery date; the frozen schedule must not use booking creation time. */
  serviceDate: Date;
}

/** Resolves the NĐ 117 rate once, inside the booking transaction. */
@Injectable()
export class ResolveWithholdingUseCase {
  constructor(
    @Inject(WITHHOLDING_RATE_REPOSITORY)
    private readonly withholdingRates: IWithholdingRateRepository,
  ) {}

  async execute(tx: PrismaTx, target: ResolveWithholdingTarget): Promise<WithholdingSnapshot> {
    const none = noWithholding(target.serviceDate);
    const partner = await tx.partner.findUnique({
      where: { id: target.partnerId },
      select: { isHouse: true, taxStatus: true },
    });

    // House inventory belongs to the tenant; companies invoice and declare for
    // themselves. Every household/individual branch is withheld from.
    if (!partner || partner.isHouse || !partnerIsWithheld(partner.taxStatus)) return none;

    const rate = selectWithholdingRate(
      await this.withholdingRates.list(tx),
      'service',
      target.serviceDate,
    );
    if (!rate) return none;

    return {
      rateId: rate.id,
      activity: rate.activity,
      vatBps: rate.vatBps,
      pitBps: rate.pitBps,
      legalRef: rate.legalRef,
      resolvedFor: target.serviceDate.toISOString(),
    };
  }
}
