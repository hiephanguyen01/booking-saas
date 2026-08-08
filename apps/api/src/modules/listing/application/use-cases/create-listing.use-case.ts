import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateListingInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { resolveTenantTimezone } from '../../../../shared/tenant-context/tenant-timezone';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
} from '../../../catalog/domain/ports/listing-type-repository.port';
import { assertValidAttributes } from '../../../catalog/application/assert-valid-attributes';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
} from '../../../partner/domain/ports/partner-repository.port';
import { assertCanServeListingType } from '../../../partner/application/assert-can-serve-listing-type';
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
import { AssertListingDepositCoverageUseCase } from './assert-listing-deposit-coverage.use-case';
import {
  ListingModeConfigError,
  validateAndNormalizeModeConfig,
} from '../../../../shared/domain/pricing/package-config';
import { Listing } from '../../domain/entities/listing.entity';
import { ListingGroup } from '../../domain/entities/listing-group.entity';
import {
  ListingSlugTaken,
  ResourceNotFound,
  ResourceNotOwned,
} from '../../domain/errors/listing-errors';
import { ListingPricingRejected } from '../../domain/errors/pricing-rule-errors';
import { ListingTypeNotFound } from '../../../../shared/domain/errors/listing-type-not-found';
import { PartnerNotFound } from '../../../../shared/domain/errors/partner-not-found';
import {
  ListingGroupNotFound,
  ListingGroupNotOwned,
  ListingGroupTypeMismatch,
} from '../../domain/errors/listing-group-errors';
import { buildPublicSlug } from '../../../../shared/domain/public-slug';

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
    private readonly resolveAdministrativeAddress: ResolveAdministrativeAddressUseCase,
    private readonly assertDepositCoverage: AssertListingDepositCoverageUseCase,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, input: CreateListingInput): Promise<ListingRecord> {
    const slug =
      input.slug ??
      buildPublicSlug(input.title, randomUUID().replaceAll('-', '').slice(0, 6), 'tin-dang');
    const location = await this.resolveAdministrativeAddress.execute(
      input.provinceCode,
      input.wardCode,
    );
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      if (await this.listings.findBySlug(tx, slug)) {
        throw new ListingSlugTaken(slug);
      }

      const type = await this.listingTypes.findById(tx, input.listingTypeId);
      if (!type) {
        throw new ListingTypeNotFound();
      }
      Listing.assertBookingModesAllowed(input.bookingModes, type.allowedModes);
      assertValidAttributes(type.attributeSchema, input.attributes);
      let modeConfig: ReturnType<typeof validateAndNormalizeModeConfig>;
      try {
        modeConfig = validateAndNormalizeModeConfig({
          bookingSelection: type.bookingSelection,
          bookingModes: input.bookingModes,
          modeConfig: input.modeConfig,
          validationContext: 'draft',
        });
      } catch (error) {
        if (error instanceof ListingModeConfigError) {
          throw new ListingPricingRejected(error.code, error.message);
        }
        throw error;
      }

      const partner = await this.partners.findById(tx, input.partnerId);
      if (!partner) {
        throw new PartnerNotFound();
      }
      assertCanServeListingType(
        { verificationStatus: partner.verificationStatus },
        { requiresIdentityVerification: type.requiresIdentityVerification },
      );
      await this.assertDepositCoverage.execute(
        tx,
        {
          partnerId: partner.id,
          listingTypeId: input.listingTypeId,
          categoryId: input.categoryId ?? null,
          isHouse: partner.isHouse,
        },
        input.depositPercent,
      );

      // A bound group must belong to the same partner (§7.3: a post and its child
      // listings share one owner — a partner cannot attach to another's post).
      if (input.groupId) {
        const group = await this.groups.findById(tx, input.groupId);
        if (!group) {
          throw new ListingGroupNotFound();
        }
        if (group.partnerId !== input.partnerId) {
          throw new ListingGroupNotOwned();
        }
        if (group.listingTypeId !== input.listingTypeId) {
          throw new ListingGroupTypeMismatch();
        }
        ListingGroup.rehydrate(group).assertItemsAddable();
      }

      // Reuse a shared resource, or auto-create a dedicated 1:1 one.
      let resourceId = input.resourceId;
      if (resourceId) {
        const resource = await this.resources.findById(tx, resourceId);
        if (!resource) {
          throw new ResourceNotFound();
        }
        // A shared calendar resource belongs to a partner (§7.3) — partner A must
        // not attach partner B's resource and thereby read/block B's calendar.
        if (resource.partnerId !== input.partnerId) {
          throw new ResourceNotOwned();
        }
      } else {
        const resource = await this.resources.create(tx, tenantId, {
          partnerId: input.partnerId,
          name: input.title,
          timezone: await resolveTenantTimezone(tx, tenantId),
        });
        resourceId = resource.id;
      }

      const created = await this.listings.create(
        tx,
        tenantId,
        Listing.open({
          partnerId: input.partnerId,
          listingTypeId: input.listingTypeId,
          resourceId,
          groupId: input.groupId ?? null,
          categoryId: input.categoryId ?? null,
          title: input.title,
          slug,
          description: input.description ?? null,
          provinceCode: location.province.code,
          provinceName: location.province.name,
          wardCode: location.ward.code,
          wardName: location.ward.name,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
          photos: input.photos,
          attributes: input.attributes,
          bookingModes: input.bookingModes,
          modeConfig: modeConfig as Record<string, unknown>,
          stockQuantity: input.stockQuantity ?? null,
          capacity: input.capacity ?? null,
          bufferBefore: input.bufferBefore,
          bufferAfter: input.bufferAfter,
          approvalRequired: input.approvalRequired,
          depositPercent: input.depositPercent,
          balanceDue: input.balanceDue,
          cancellationPolicyId: input.cancellationPolicyId ?? null,
        }),
      );
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing.created',
        payload: { listingId: created.id },
      });
      return created;
    });
  }
}
