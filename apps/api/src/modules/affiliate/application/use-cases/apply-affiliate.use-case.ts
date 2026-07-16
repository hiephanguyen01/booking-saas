import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { ApplyAffiliateInput } from '@booking/contracts';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { resolveEffectiveAffiliateRate, type EffectiveAffiliateRate } from '../../domain/affiliate-rate';
import {
  AFFILIATE_REPOSITORY,
  type AffiliateWithUser,
  type IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';
import {
  COMMISSION_RULE_READER,
  type ICommissionRuleReader,
} from '../../domain/ports/commission-rule-reader.port';

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
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(COMMISSION_RULE_READER) private readonly rules: ICommissionRuleReader,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(userId: string, input: ApplyAffiliateInput): Promise<AppliedAffiliate> {
    const tenant = await this.tenants.findById(input.tenantId);
    if (!tenant) {
      throw new NotFoundException({ statusCode: 404, code: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
    }
    if (tenant.status !== 'active') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'TENANT_INACTIVE',
        message: 'Tenant is not accepting affiliate applications',
      });
    }

    return this.tenantDb.forTenant(input.tenantId, async (tx) => {
      const existing = await this.affiliates.findByUser(tx, userId);
      const affiliateId = existing?.id ?? (await this.create(tx, userId, input));

      // Re-read through the relation-joined view so the response carries the same
      // tenant hostname + rate as every other read of a membership — the applicant
      // needs the storefront origin its links will point at, not just an id.
      const affiliate = await this.affiliates.findByUserWithTenant(tx, affiliateId);
      if (!affiliate) {
        throw new InternalServerErrorException({
          statusCode: 500,
          code: 'AFFILIATE_NOT_FOUND',
          message: 'Affiliate could not be read back after creation',
        });
      }
      const rule = await this.rules.findTenantDefault(tx);
      return { affiliate, effectiveRate: resolveEffectiveAffiliateRate(affiliate.customRate, rule) };
    });
  }

  private async create(tx: PrismaTx, userId: string, input: ApplyAffiliateInput): Promise<string> {
    const created = await this.affiliates.create(tx, input.tenantId, {
      userId,
      payoutInfo: input.payoutInfo,
    });
    await this.outbox.emit(tx, {
      tenantId: input.tenantId,
      eventType: 'affiliate.applied',
      payload: { affiliateId: created.id, userId },
    });
    return created.id;
  }
}
