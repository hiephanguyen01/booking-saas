import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateListingInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { resolveTenantTimezone } from '../../../../shared/tenant-context/tenant-timezone';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
} from '../../../catalog/domain/ports/listing-type-repository.port';
import { AttributeValidatorService } from '../../../catalog/application/services/attribute-validator.service';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
} from '../../../partner/domain/ports/partner-repository.port';
import { PartnerVerificationService } from '../../../partner/application/services/partner-verification.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
  type ListingRecord,
} from '../../domain/ports/listing-repository.port';
import {
  RESOURCE_REPOSITORY,
  type IResourceRepository,
} from '../../domain/ports/resource-repository.port';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
} from '../../domain/ports/listing-group-repository.port';
import { ResolveAdministrativeAddressUseCase } from '../../../administrative-division/application/use-cases/resolve-administrative-address.use-case';

/**
 * Create a listing. Inside one tenant transaction it validates the attributes
 * against the listing type's schema, enforces bookingModes ⊆ allowedModes, and
 * runs the partner identity-verification gate (§7.3, Tasks 1.2/1.3). A shared
 * resourceId may be reused; otherwise a 1:1 resource is auto-created.
 */
@Injectable()
export class CreateListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resources: IResourceRepository,
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_TYPE_REPOSITORY) private readonly listingTypes: IListingTypeRepository,
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly attributeValidator: AttributeValidatorService,
    private readonly partnerVerification: PartnerVerificationService,
    private readonly resolveAdministrativeAddress: ResolveAdministrativeAddressUseCase,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, input: CreateListingInput): Promise<ListingRecord> {
    const location = await this.resolveAdministrativeAddress.execute(
      input.provinceCode,
      input.wardCode,
    );
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      if (await this.listings.findBySlug(tx, input.slug)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'LISTING_SLUG_TAKEN',
          message: `Slug "${input.slug}" is already in use`,
        });
      }

      const type = await this.listingTypes.findById(tx, input.listingTypeId);
      if (!type) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_TYPE_NOT_FOUND',
          message: 'Listing type not found',
        });
      }
      const invalidModes = input.bookingModes.filter((m) => !type.allowedModes.includes(m));
      if (invalidModes.length > 0) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_BOOKING_MODES',
          message: `Modes not allowed by the listing type: ${invalidModes.join(', ')}`,
        });
      }
      this.attributeValidator.assertValidAttributes(type.attributeSchema, input.attributes);

      const partner = await this.partners.findById(tx, input.partnerId);
      if (!partner) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'PARTNER_NOT_FOUND',
          message: 'Partner not found',
        });
      }
      this.partnerVerification.assertCanServeListingType(
        { verificationStatus: partner.verificationStatus },
        { requiresIdentityVerification: type.requiresIdentityVerification },
      );

      // A bound group must belong to the same partner (§7.3: a post and its child
      // listings share one owner — a partner cannot attach to another's post).
      if (input.groupId) {
        const group = await this.groups.findById(tx, input.groupId);
        if (!group) {
          throw new NotFoundException({
            statusCode: 404,
            code: 'LISTING_GROUP_NOT_FOUND',
            message: 'Listing group not found',
          });
        }
        if (group.partnerId !== input.partnerId) {
          throw new ForbiddenException({
            statusCode: 403,
            code: 'LISTING_GROUP_NOT_OWNED',
            message: 'The listing group belongs to another partner',
          });
        }
        if (group.listingTypeId !== input.listingTypeId) {
          throw new BadRequestException({
            statusCode: 400,
            code: 'LISTING_GROUP_TYPE_MISMATCH',
            message: 'The listing and its group must use the same listing type',
          });
        }
        if (group.status !== 'draft') {
          throw new ConflictException({
            statusCode: 409,
            code: 'LISTING_GROUP_READ_ONLY',
            message: 'Hide the listing group before changing its items',
          });
        }
      }

      // Reuse a shared resource, or auto-create a dedicated 1:1 one.
      let resourceId = input.resourceId;
      if (resourceId) {
        const resource = await this.resources.findById(tx, resourceId);
        if (!resource) {
          throw new NotFoundException({
            statusCode: 404,
            code: 'RESOURCE_NOT_FOUND',
            message: 'Resource not found',
          });
        }
        // A shared calendar resource belongs to a partner (§7.3) — partner A must
        // not attach partner B's resource and thereby read/block B's calendar.
        if (resource.partnerId !== input.partnerId) {
          throw new ForbiddenException({
            statusCode: 403,
            code: 'RESOURCE_NOT_OWNED',
            message: 'The resource belongs to another partner',
          });
        }
      } else {
        const resource = await this.resources.create(tx, tenantId, {
          partnerId: input.partnerId,
          name: input.title,
          timezone: await resolveTenantTimezone(tx, tenantId),
        });
        resourceId = resource.id;
      }

      const created = await this.listings.create(tx, tenantId, {
        partnerId: input.partnerId,
        listingTypeId: input.listingTypeId,
        resourceId,
        groupId: input.groupId ?? null,
        categoryId: input.categoryId ?? null,
        title: input.title,
        slug: input.slug,
        description: input.description ?? null,
        provinceCode: location.province.code,
        provinceName: location.province.name,
        wardCode: location.ward.code,
        wardName: location.ward.name,
        address: input.address,
        photos: input.photos,
        attributes: input.attributes,
        bookingModes: input.bookingModes,
        modeConfig: input.modeConfig as Record<string, unknown>,
        stockQuantity: input.stockQuantity ?? null,
        capacity: input.capacity ?? null,
        bufferBefore: input.bufferBefore,
        bufferAfter: input.bufferAfter,
        approvalRequired: input.approvalRequired,
        depositPercent: input.depositPercent,
        balanceDue: input.balanceDue,
        cancellationPolicyId: input.cancellationPolicyId ?? null,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing.created',
        payload: { listingId: created.id },
      });
      return created;
    });
  }
}
