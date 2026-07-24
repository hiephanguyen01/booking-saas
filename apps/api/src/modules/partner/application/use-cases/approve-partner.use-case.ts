import { Inject, Injectable } from '@nestjs/common';
import type { ApprovePartnerInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { Partner, type PartnerState } from '../../domain/entities/partner.entity';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import {
  AGREEMENT_REPOSITORY,
  type IAgreementRepository,
} from '../../domain/ports/agreement-repository.port';

export interface ApproveContext {
  userId: string;
  ip?: string | null;
}

function toPartnerState(partner: PartnerRecord): PartnerState {
  return {
    id: partner.id,
    tenantId: partner.tenantId,
    name: partner.name,
    slug: partner.slug,
    description: partner.description,
    partnerType: partner.partnerType,
    isHouse: partner.isHouse,
    status: partner.status,
    verificationStatus: partner.verificationStatus,
    verifiedAt: partner.verifiedAt,
    dateOfBirth: partner.dateOfBirth,
    payoutInfo: partner.payoutInfo,
    businessInfo: partner.businessInfo,
    contactInfo: partner.contactInfo,
    identityInfo: partner.identityInfo,
    defaultCancellationPolicyId: partner.defaultCancellationPolicyId,
  };
}

/**
 * Tenant approves a pending partner (§7.3). Fee-schedule + partner-terms
 * acceptance is recorded in agreement_acceptances at approval (§7.2) so a later
 * commission dispute has proof. Idempotent for an already-approved partner.
 */
@Injectable()
export class ApprovePartnerUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    @Inject(AGREEMENT_REPOSITORY) private readonly agreements: IAgreementRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    partnerId: string,
    input: ApprovePartnerInput,
    ctx: ApproveContext,
  ): Promise<PartnerRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const partner = await this.partners.findById(tx, partnerId);
      if (!partner) throw new PartnerNotFound();

      const outcome = Partner.rehydrate(toPartnerState(partner)).approve(input.agreementVersion);
      if (outcome.kind === 'noop') return partner;

      const updated = await this.partners.updateStatus(tx, partnerId, outcome.statusIntent);
      for (const agreement of outcome.agreements) {
        await this.agreements.record(tx, {
          tenantId,
          partnerId,
          userId: ctx.userId,
          agreementType: agreement.agreementType,
          version: agreement.version,
          ip: ctx.ip,
        });
      }
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.approved',
        payload: { partnerId },
      });
      return updated;
    });
  }
}
