import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UpdateListingTypeInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
  type ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';

@Injectable()
export class UpdateListingTypeUseCase {
  constructor(
    @Inject(LISTING_TYPE_REPOSITORY) private readonly repo: IListingTypeRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    input: UpdateListingTypeInput,
  ): Promise<ListingTypeRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.repo.findById(tx, id);
      if (!existing) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_TYPE_NOT_FOUND',
          message: 'Listing type not found',
        });
      }
      if (input.slug && input.slug !== existing.slug) {
        const other = await this.repo.findBySlug(tx, input.slug);
        if (other && other.id !== id) {
          throw new ConflictException({
            statusCode: 409,
            code: 'LISTING_TYPE_SLUG_TAKEN',
            message: `Slug "${input.slug}" is already in use`,
          });
        }
      }
      // Re-check the subset rule against the merged state (a PATCH may change only
      // one of allowedModes/defaultModes; the zod refine only fires when both are sent).
      const allowed = input.allowedModes ?? existing.allowedModes;
      const defaults = input.defaultModes ?? existing.defaultModes;
      const invalid = defaults.filter((m) => !allowed.includes(m));
      if (invalid.length > 0) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_DEFAULT_MODES',
          message: `defaultModes must be a subset of allowedModes; invalid: ${invalid.join(', ')}`,
        });
      }
      const searchConfig = input.searchConfig ?? existing.searchConfig;
      if (searchConfig.schedule !== 'none' && !allowed.includes(searchConfig.schedule)) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_SEARCH_SCHEDULE',
          message: `Search schedule "${searchConfig.schedule}" must be enabled by allowedModes`,
        });
      }
      const attributes = input.attributeSchema ?? existing.attributeSchema;
      const filterable = new Set(attributes.filter((field) => field.filterable).map((field) => field.key));
      const invalidFacets = searchConfig.attributeFacets.filter((facet) => !filterable.has(facet.key));
      if (invalidFacets.length > 0) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_SEARCH_FACET',
          message: `Search facets must reference filterable attributes: ${invalidFacets.map((facet) => facet.key).join(', ')}`,
        });
      }

      const updated = await this.repo.update(tx, id, {
        name: input.name,
        slug: input.slug,
        icon: input.icon,
        allowedModes: input.allowedModes,
        defaultModes: input.defaultModes,
        attributeSchema: input.attributeSchema,
        searchConfig: input.searchConfig,
        unitLabel: input.unitLabel,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        requiresIdentityVerification: input.requiresIdentityVerification,
        structure: input.structure,
        itemLabel: input.itemLabel,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_type.updated',
        payload: { listingTypeId: id },
      });
      return updated;
    });
  }
}
