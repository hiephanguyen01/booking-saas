import { Inject, Injectable } from '@nestjs/common';
import {
  type PrismaTx,
  TenantDbService,
} from '../../../../shared/tenant-context/tenant-db.service';
import {
  COMMISSION_RULE_REPOSITORY,
  type ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { selectCommissionRule } from '../../domain/commission-rule-precedence';
import {
  defaultCommissionSnapshot,
  type CommissionSnapshot,
} from '../../../../shared/domain/commission/commission-snapshot';
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

export interface ResolveCommissionTarget {
  tenantId: string;
  partnerId: string;
  listingTypeId: string | null;
  categoryId: string | null;
  isHouse: boolean;
  /**
   * Booking start. VAT on a service is fixed by the date the service is
   * DELIVERED, so a 2026-12-20 booking for a 2027-01-15 session is a 10%
   * booking. Never pass `now` here.
   */
  serviceDate: Date;
}

/**
 * Resolves the applicable commission rule at booking time and freezes it into an
 * immutable {@link CommissionSnapshot} (§13.1). Called by the booking module INSIDE
 * its `forTenant` transaction so the snapshot commits atomically with the booking.
 * Exported by the finance module; the booking module never touches commission rules
 * directly.
 */
@Injectable()
export class ResolveCommissionUseCase {
  constructor(
    @Inject(COMMISSION_RULE_REPOSITORY) private readonly rules: ICommissionRuleRepository,
    @Inject(TAX_RATE_REPOSITORY) private readonly taxRates: ITaxRateRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tx: PrismaTx, target: ResolveCommissionTarget): Promise<CommissionSnapshot> {
    const candidates = await this.rules.list(tx);
    const rule = selectCommissionRule(
      candidates,
      {
        partnerId: target.partnerId,
        listingTypeId: target.listingTypeId,
        categoryId: target.categoryId,
      },
      await this.tenantDb.databaseNow(tx),
    );
    const tax = await this.resolveTax(tx, target);
    if (!rule) return { ...defaultCommissionSnapshot(target.isHouse, target.serviceDate), tax };
    return {
      ruleId: rule.id,
      appliesTo: rule.appliesTo,
      tenantRateType: rule.tenantRateType,
      tenantRate: rule.tenantRate.toString(),
      platformRate: rule.platformRate,
      affiliateRateType: rule.affiliateRateType,
      affiliateRate: rule.affiliateRate.toString(),
      isHouse: target.isHouse,
      tax,
    };
  }

  /**
   * Two gates before a rate even matters: WHO sells (an exempt household charges
   * no VAT whatever it sells) and WHAT is sold (the listing type's category).
   * A house partner is sold by the TENANT, so the tenant's own status governs.
   * Any miss falls back to 0% — the pre-VAT behaviour — rather than guessing.
   */
  private async resolveTax(tx: PrismaTx, target: ResolveCommissionTarget): Promise<TaxSnapshot> {
    const none = noTax(target.serviceDate);
    if (!target.listingTypeId) return none;

    const seller = target.isHouse
      ? await tx.tenant.findUnique({
          where: { id: target.tenantId },
          select: { taxStatus: true },
        })
      : await tx.partner.findUnique({
          where: { id: target.partnerId },
          select: { taxStatus: true },
        });
    if (!seller || !partnerChargesVat(seller.taxStatus)) return none;

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
