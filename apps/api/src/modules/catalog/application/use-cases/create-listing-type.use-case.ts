import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { CreateListingTypeInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
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
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      if (await this.repo.findBySlug(tx, input.slug)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'LISTING_TYPE_SLUG_TAKEN',
          message: `Slug "${input.slug}" is already in use`,
        });
      }
      const created = await this.repo.create(tx, tenantId, {
        name: input.name,
        slug: input.slug,
        icon: input.icon ?? null,
        allowedModes: input.allowedModes,
        defaultModes: input.defaultModes,
        attributeSchema: input.attributeSchema,
        unitLabel: input.unitLabel ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        requiresIdentityVerification: input.requiresIdentityVerification,
        structure: input.structure,
        itemLabel: input.itemLabel ?? null,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_type.created',
        payload: { listingTypeId: created.id },
      });
      return created;
    });
  }
}
