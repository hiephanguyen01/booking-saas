import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateListingTypeInput } from '@booking/contracts';
import { buildPublicSlug } from '../../../../shared/domain/public-slug';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingType } from '../../domain/entities/listing-type.entity';
import { ListingTypeSlugTaken } from '../../domain/errors/listing-type-errors';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
  type ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';

/** Tenant admin defines a new listing type with its typed attribute schema (§7.3). */
@Injectable()
export class CreateListingTypeUseCase {
  constructor(
    @Inject(LISTING_TYPE_REPOSITORY) private readonly repo: IListingTypeRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, input: CreateListingTypeInput): Promise<ListingTypeRecord> {
    const slug =
      input.slug ??
      buildPublicSlug(
        input.name,
        randomUUID().replaceAll('-', '').slice(0, 6),
        'loai-dich-vu',
      );

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      // Pre-check only: the `(tenant_id, slug)` unique index is the real arbiter.
      if (await this.repo.findBySlug(tx, slug)) {
        throw new ListingTypeSlugTaken(slug);
      }
      const created = await this.repo.create(tx, tenantId, ListingType.open({ ...input, slug }));
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_type.created',
        payload: { listingTypeId: created.id },
      });
      return created;
    });
  }
}
