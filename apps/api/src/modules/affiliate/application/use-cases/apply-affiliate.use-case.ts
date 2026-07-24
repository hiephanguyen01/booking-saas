import { Inject, Injectable } from '@nestjs/common';
import type { ApplyAffiliateInput } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { resolveEffectiveAffiliateRate, type EffectiveAffiliateRate } from '../../domain/affiliate-rate';
import {
  Affiliate,
  type NewAffiliate,
} from '../../domain/entities/affiliate.entity';
import {
  AFFILIATE_READER,
  type AffiliateWithUser,
  type IAffiliateReader,
} from '../../domain/ports/affiliate-reader.port';
import {
  AFFILIATE_REPOSITORY,
  type IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';
import {
  COMMISSION_RULE_READER,
  type ICommissionRuleReader,
} from '../../domain/ports/commission-rule-reader.port';
import { AffiliateReadbackFailed } from '../affiliate-http-errors';

export interface AppliedAffiliate {
  affiliate: AffiliateWithUser;
  effectiveRate: EffectiveAffiliateRate;
}

/**
 * A logged-in user applies to become an affiliate for a tenant (§15.1 self-signup,
 * tenant approves). Starts `pending`. Re-applying returns the existing membership
 * (idempotent) so the storefront form is safe to resubmit. This route has no
 * tenant context — the tenant is taken from the (BFF-resolved) body and validated.
 */
@Injectable()
export class ApplyAffiliateUseCase {
  constructor(
    @Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository,
    @Inject(AFFILIATE_READER) private readonly affiliateReader: IAffiliateReader,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(COMMISSION_RULE_READER) private readonly rules: ICommissionRuleReader,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(userId: string, input: ApplyAffiliateInput): Promise<AppliedAffiliate> {
    const tenant = await this.tenants.findById(input.tenantId);
    if (!tenant) throw new TenantNotFound();
    const application = Affiliate.apply({
      tenantId: input.tenantId,
      userId,
      payoutInfo: input.payoutInfo,
      tenantStatus: tenant.status,
    });

    return this.tenantDb.forTenant(input.tenantId, async (tx) => {
      const existing = await this.affiliates.loadByUser(tx, userId);
      const affiliateId = existing?.id ?? (await this.create(tx, application));

      // Re-read through the relation-joined view so the response carries the same
      // tenant hostname + rate as every other read of a membership — the applicant
      // needs the storefront origin its links will point at, not just an id.
      const affiliate = await this.affiliateReader.findByUserWithTenant(
        tx,
        affiliateId,
      );
      if (!affiliate) {
        throw new AffiliateReadbackFailed();
      }
      const rule = await this.rules.findTenantDefault(tx);
      return { affiliate, effectiveRate: resolveEffectiveAffiliateRate(affiliate.customRate, rule) };
    });
  }

  private async create(
    tx: PrismaTx,
    application: NewAffiliate,
  ): Promise<string> {
    const created = await this.affiliates.create(tx, application);
    await this.outbox.emit(tx, {
      tenantId: application.tenantId,
      eventType: 'affiliate.applied',
      payload: { affiliateId: created.id, userId: application.userId },
    });
    return created.id;
  }
}
