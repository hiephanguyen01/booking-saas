import { Inject, Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  noTax,
  partnerChargesVat,
  selectTaxRate,
  type TaxSnapshot,
} from '../../../../shared/domain/tax/tax';
import {
  TAX_RATE_REPOSITORY,
  type ITaxRateRepository,
} from '../../domain/ports/tax-rate-repository.port';

export interface ResolveTaxTarget {
  tenantId: string;
  partnerId: string;
  listingTypeId: string | null;
  /**
   * When the service is DELIVERED, not when it is booked. VAT on a service is
   * fixed by the delivery date, so a 2026-12-20 booking for a 2027-01-15 session
   * is a 10% booking. Never pass `now`.
   */
  serviceDate: Date;
}

/**
 * The single place a VAT rate is decided (§VAT). Both the checkout quote and
 * booking creation go through it, so the rate a customer is shown can never
 * disagree with the rate frozen onto their booking.
 *
 * Two gates before a rate even matters: WHO sells (an exempt household charges no
 * VAT whatever it sells; house inventory is sold by the TENANT, so the tenant's
 * own status governs) and WHAT is sold (the listing type's category). Any miss
 * falls back to 0% — the pre-VAT behaviour — rather than guessing.
 */
@Injectable()
export class ResolveTaxUseCase {
  constructor(@Inject(TAX_RATE_REPOSITORY) private readonly taxRates: ITaxRateRepository) {}

  async execute(tx: PrismaTx, target: ResolveTaxTarget): Promise<TaxSnapshot> {
    const none = noTax(target.serviceDate);
    if (!target.listingTypeId) return none;

    const partner = await tx.partner.findUnique({
      where: { id: target.partnerId },
      select: { isHouse: true, taxStatus: true },
    });
    if (!partner) return none;

    const sellerStatus = partner.isHouse
      ? (
          await tx.tenant.findUnique({
            where: { id: target.tenantId },
            select: { taxStatus: true },
          })
        )?.taxStatus
      : partner.taxStatus;
    if (!sellerStatus || !partnerChargesVat(sellerStatus)) return none;

    const listingType = await tx.listingType.findUnique({
      where: { id: target.listingTypeId },
      select: { taxCategory: true },
    });
    if (!listingType) return none;

    const rate = selectTaxRate(
      await this.taxRates.list(tx),
      listingType.taxCategory,
      target.serviceDate,
    );
    if (!rate) return none;

    return {
      taxRateId: rate.id,
      category: rate.category,
      vatBps: rate.rateBps,
      legalRef: rate.legalRef,
      resolvedFor: target.serviceDate.toISOString(),
    };
  }
}
