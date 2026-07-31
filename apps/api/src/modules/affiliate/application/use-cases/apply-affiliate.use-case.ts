import { Inject, Injectable } from '@nestjs/common';
import type { ApplyAffiliateInput, LegalConsentInput } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { RecordLegalAcceptanceUseCase } from '../../../legal/application/use-cases/record-legal-acceptance.use-case';
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

/** Caller-supplied request facts that have no bearing on the idempotent re-apply
 * branch but must be threaded down to the acceptance write in the `create` branch. */
export interface ApplyAffiliateContext {
  ip?: string | null;
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
    private readonly recordLegalAcceptance: RecordLegalAcceptanceUseCase,
  ) {}

  async execute(
    userId: string,
    input: ApplyAffiliateInput,
    ctx: ApplyAffiliateContext = {},
  ): Promise<AppliedAffiliate> {
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
      const affiliateId =
        existing?.id ?? (await this.create(tx, application, input.legalConsent, ctx));

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

  /**
   * The only branch that creates a membership. `execute`'s
   * `existing?.id ?? (await this.create(...))` short-circuits here on re-apply,
   * so the acceptance write lives inside this branch only — writing it
   * unconditionally would add a duplicate acceptance row on every resubmit of a
   * safe-to-resubmit form.
   */
  private async create(
    tx: PrismaTx,
    application: NewAffiliate,
    legalConsent: LegalConsentInput,
    ctx: ApplyAffiliateContext,
  ): Promise<string> {
    const created = await this.affiliates.create(tx, application);
    await this.outbox.emit(tx, {
      tenantId: application.tenantId,
      eventType: 'affiliate.applied',
      payload: { affiliateId: created.id, userId: application.userId },
    });
    // One row per accepted document version (affiliate terms + customer terms +
    // privacy policy — one tick, three documents, plan decision D6); the
    // use-case derives each row's agreementType from its version's document.
    await this.recordLegalAcceptance.execute(tx, {
      tenantId: application.tenantId,
      userId: application.userId,
      partnerId: null,
      acceptedVersionIds: legalConsent.acceptedVersionIds,
      requestedLocale: legalConsent.acceptedLocale,
      // Enforced server-side, not only by the form's required tick.
      requiredDocTypes: ['affiliate_terms'],
      ip: ctx.ip ?? null,
    });
    return created.id;
  }
}
