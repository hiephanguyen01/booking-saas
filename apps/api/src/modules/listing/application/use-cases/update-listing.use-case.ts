import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BookingMode, UpdateListingInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
} from '../../../catalog/domain/ports/listing-type-repository.port';
import { AttributeValidatorService } from '../../../catalog/application/services/attribute-validator.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../domain/ports/listing-repository.port';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
} from '../../domain/ports/listing-group-repository.port';

@Injectable()
export class UpdateListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_TYPE_REPOSITORY) private readonly listingTypes: IListingTypeRepository,
    private readonly attributeValidator: AttributeValidatorService,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, id: string, input: UpdateListingInput): Promise<ListingRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.listings.findById(tx, id);
      if (!existing) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_NOT_FOUND',
          message: 'Listing not found',
        });
      }
      if (input.slug && input.slug !== existing.slug) {
        const other = await this.listings.findBySlug(tx, input.slug);
        if (other && other.id !== id) {
          throw new ConflictException({
            statusCode: 409,
            code: 'LISTING_SLUG_TAKEN',
            message: `Slug "${input.slug}" is already in use`,
          });
        }
      }

      // A re-bound group must belong to the listing's own partner (§7.3) — a
      // partner cannot move a listing under another partner's post.
      if (input.groupId !== undefined && input.groupId !== null) {
        const group = await this.groups.findById(tx, input.groupId);
        if (!group) {
          throw new NotFoundException({
            statusCode: 404,
            code: 'LISTING_GROUP_NOT_FOUND',
            message: 'Listing group not found',
          });
        }
        if (group.partnerId !== existing.partnerId) {
          throw new ForbiddenException({
            statusCode: 403,
            code: 'LISTING_GROUP_NOT_OWNED',
            message: 'The listing group belongs to another partner',
          });
        }
      }

      // Re-validate attributes / modes against the (unchanged) listing type.
      if (input.attributes !== undefined || input.bookingModes !== undefined) {
        const type = await this.listingTypes.findById(tx, existing.listingTypeId);
        if (!type) {
          throw new NotFoundException({
            statusCode: 404,
            code: 'LISTING_TYPE_NOT_FOUND',
            message: 'Listing type not found',
          });
        }
        if (input.attributes !== undefined) {
          this.attributeValidator.assertValidAttributes(type.attributeSchema, input.attributes);
        }
        if (input.bookingModes !== undefined) {
          const invalid = input.bookingModes.filter((m) => !type.allowedModes.includes(m));
          if (invalid.length > 0) {
            throw new BadRequestException({
              statusCode: 400,
              code: 'INVALID_BOOKING_MODES',
              message: `Modes not allowed by the listing type: ${invalid.join(', ')}`,
            });
          }
          const modeConfig = (input.modeConfig ?? existing.modeConfig) as Record<string, unknown>;
          const missing = input.bookingModes.filter((m: BookingMode) => modeConfig[m] === undefined);
          if (missing.length > 0) {
            throw new BadRequestException({
              statusCode: 400,
              code: 'MISSING_MODE_CONFIG',
              message: `modeConfig missing for: ${missing.join(', ')}`,
            });
          }
        }
      }

      const updated = await this.listings.update(tx, id, {
        groupId: input.groupId,
        categoryId: input.categoryId,
        title: input.title,
        slug: input.slug,
        description: input.description,
        photos: input.photos,
        attributes: input.attributes,
        bookingModes: input.bookingModes,
        modeConfig: input.modeConfig as Record<string, unknown> | undefined,
        stockQuantity: input.stockQuantity,
        capacity: input.capacity,
        bufferBefore: input.bufferBefore,
        bufferAfter: input.bufferAfter,
        approvalRequired: input.approvalRequired,
        depositPercent: input.depositPercent,
        balanceDue: input.balanceDue,
        cancellationPolicyId: input.cancellationPolicyId,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing.updated',
        payload: { listingId: id },
      });
      return updated;
    });
  }
}
