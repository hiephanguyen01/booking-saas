import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { CreateHousePartnerInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';

/**
 * Tenant admin creates a house partner — the tenant selling its own inventory
 * (§7.3). Approved on creation; no payout/identity is required (platform fee is
 * computed directly on GMV). The plan's partner limit still applies (guard).
 */
@Injectable()
export class CreateHousePartnerUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, input: CreateHousePartnerInput): Promise<PartnerRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      if (await this.partners.findBySlug(tx, input.slug)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'PARTNER_SLUG_TAKEN',
          message: `Slug "${input.slug}" is already in use`,
        });
      }
      const created = await this.partners.create(tx, tenantId, {
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        partnerType: 'company',
        isHouse: true,
        status: 'approved',
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'partner.created',
        payload: { partnerId: created.id, isHouse: true },
      });
      return created;
    });
  }
}
