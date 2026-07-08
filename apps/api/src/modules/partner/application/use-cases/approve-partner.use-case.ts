import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ApprovePartnerInput } from '@booking/shared';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import {
  AGREEMENT_REPOSITORY,
  type IAgreementRepository,
} from '../../domain/ports/agreement-repository.port';
import {
  CURRENT_COMMISSION_SCHEDULE_VERSION,
  CURRENT_PARTNER_TERMS_VERSION,
} from '../../domain/agreement-versions';

export interface ApproveContext {
  userId: string;
  ip?: string | null;
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
      if (!partner) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'PARTNER_NOT_FOUND',
          message: 'Partner not found',
        });
      }
      if (partner.status === 'approved') return partner; // idempotent
      if (partner.status !== 'pending') {
        throw new ConflictException({
          statusCode: 409,
          code: 'INVALID_PARTNER_STATE',
          message: `Cannot approve a partner in "${partner.status}" state`,
        });
      }

      const updated = await this.partners.update(tx, partnerId, { status: 'approved' });
      const version = input.agreementVersion;
      await this.agreements.record(tx, {
        tenantId,
        partnerId,
        userId: ctx.userId,
        agreementType: 'partner_terms',
        version: version ?? CURRENT_PARTNER_TERMS_VERSION,
        ip: ctx.ip,
      });
      await this.agreements.record(tx, {
        tenantId,
        partnerId,
        userId: ctx.userId,
        agreementType: 'commission_schedule',
        version: version ?? CURRENT_COMMISSION_SCHEDULE_VERSION,
        ip: ctx.ip,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.approved',
        payload: { partnerId },
      });
      return updated;
    });
  }
}
