import { Inject, Injectable } from '@nestjs/common';
import type { CreateResourceInput } from '@booking/shared';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { resolveTenantTimezone } from '../../../../shared/tenant-context/tenant-timezone';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  RESOURCE_REPOSITORY,
  type IResourceRepository,
  type ResourceRecord,
} from '../../domain/ports/resource-repository.port';

/** A calendar-holding resource; several listings can share one (§7.3/§9.1). */
@Injectable()
export class CreateResourceUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly repo: IResourceRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, input: CreateResourceInput): Promise<ResourceRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const timezone = input.timezone ?? (await resolveTenantTimezone(tx, tenantId));
      const created = await this.repo.create(tx, tenantId, {
        partnerId: input.partnerId,
        name: input.name,
        timezone,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'resource.created',
        payload: { resourceId: created.id },
      });
      return created;
    });
  }
}
