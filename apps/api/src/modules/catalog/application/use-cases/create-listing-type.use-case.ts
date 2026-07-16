import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
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
      if (input.searchConfig.schedule !== 'none' && !input.allowedModes.includes(input.searchConfig.schedule)) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_SEARCH_SCHEDULE',
          message: `Search schedule "${input.searchConfig.schedule}" must be enabled by allowedModes`,
        });
      }
      const filterable = new Set(
        input.attributeSchema.filter((field) => field.filterable).map((field) => field.key),
      );
      const invalidFacets = input.searchConfig.attributeFacets.filter(
        (facet) => !filterable.has(facet.key),
      );
      if (invalidFacets.length > 0) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_SEARCH_FACET',
          message: `Search facets must reference filterable attributes: ${invalidFacets.map((facet) => facet.key).join(', ')}`,
        });
      }
      const created = await this.repo.create(tx, tenantId, {
        name: input.name,
        slug: input.slug,
        icon: input.icon ?? null,
        allowedModes: input.allowedModes,
        defaultModes: input.defaultModes,
        attributeSchema: input.attributeSchema,
        searchConfig: input.searchConfig,
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
