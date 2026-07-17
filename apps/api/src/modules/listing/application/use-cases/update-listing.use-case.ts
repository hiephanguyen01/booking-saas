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
import { assertValidAttributes } from '../../../catalog/application/assert-valid-attributes';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../domain/ports/listing-repository.port';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
} from '../../domain/ports/listing-group-repository.port';
import { ResolveAdministrativeAddressUseCase } from '../../../administrative-division/application/use-cases/resolve-administrative-address.use-case';

@Injectable()
export class UpdateListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_TYPE_REPOSITORY) private readonly listingTypes: IListingTypeRepository,
    private readonly resolveAdministrativeAddress: ResolveAdministrativeAddressUseCase,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    input: UpdateListingInput,
    opts?: { requirePartnerId?: string },
  ): Promise<ListingRecord> {
    const hasLocationCodes = input.provinceCode !== undefined || input.wardCode !== undefined;
    if (hasLocationCodes && (!input.provinceCode || !input.wardCode)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_ADMINISTRATIVE_DIVISION',
        message: 'Both provinceCode and wardCode are required when changing the address',
      });
    }
    const location =
      input.provinceCode && input.wardCode
        ? await this.resolveAdministrativeAddress.execute(input.provinceCode, input.wardCode)
        : null;
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.listings.findById(tx, id);
      if (!existing) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_NOT_FOUND',
          message: 'Listing not found',
        });
      }
      // Partner-scoped callers may only edit their own listings (§7.3).
      if (opts?.requirePartnerId && existing.partnerId !== opts.requirePartnerId) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'LISTING_NOT_OWNED',
          message: 'This listing belongs to another partner',
        });
      }

      const effectiveGroupId = input.groupId === undefined ? existing.groupId : input.groupId;
      const effectiveGroup = effectiveGroupId
        ? await this.groups.findById(tx, effectiveGroupId)
        : null;
      if (effectiveGroupId && !effectiveGroup) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_GROUP_NOT_FOUND',
          message: 'Listing group not found',
        });
      }
      if (effectiveGroup && effectiveGroup.status !== 'draft') {
        throw new ConflictException({
          statusCode: 409,
          code: 'LISTING_GROUP_READ_ONLY',
          message: 'Hide the listing group before changing its items',
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
        const group = effectiveGroup;
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
        if (group.listingTypeId !== existing.listingTypeId) {
          throw new BadRequestException({
            statusCode: 400,
            code: 'LISTING_GROUP_TYPE_MISMATCH',
            message: 'The listing and its group must use the same listing type',
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
          assertValidAttributes(type.attributeSchema, input.attributes);
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
          const missing = input.bookingModes.filter(
            (m: BookingMode) => modeConfig[m] === undefined,
          );
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
        provinceCode: location?.province.code,
        provinceName: location?.province.name,
        wardCode: location?.ward.code,
        wardName: location?.ward.name,
        address: input.address,
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
