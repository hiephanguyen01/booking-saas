import { Inject, Injectable } from '@nestjs/common';
import type { UpdateListingInput } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
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
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
} from '../../../partner/domain/ports/partner-repository.port';
import { AssertListingDepositCoverageUseCase } from './assert-listing-deposit-coverage.use-case';
import {
  ListingModeConfigError,
  validateAndNormalizeModeConfig,
} from '../../../../shared/domain/pricing/package-config';
import { Listing } from '../../domain/entities/listing.entity';
import {
  InvalidListingAdministrativeDivision,
  ListingNotFound,
  ListingSlugTaken,
  ListingStateChanged,
} from '../../domain/errors/listing-errors';
import { ListingPricingRejected } from '../../domain/errors/pricing-rule-errors';
import { ListingTypeNotFound } from '../../../../shared/domain/errors/listing-type-not-found';
import { PartnerNotFound } from '../../../../shared/domain/errors/partner-not-found';
import {
  ListingGroupNotFound,
  ListingGroupNotOwned,
  ListingGroupTypeMismatch,
} from '../../domain/errors/listing-group-errors';

/**
 * The content write itself, inside a caller-owned transaction (the same shape as
 * {@link AssertListingDepositCoverageUseCase}). Two callers need it and each owns
 * its own `forTenant` boundary, which may never be nested: the partner's direct
 * edit of a draft ({@link UpdateListingUseCase}) and a reviewer approving a
 * parked edit — approval must apply the payload and close out the revision in ONE
 * transaction, so it cannot delegate to a use-case that opens its own.
 *
 * Every validation a partner edit goes through therefore also runs at approval
 * time, against the listing type as it exists then.
 */
@Injectable()
export class ApplyListingUpdateUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    @Inject(LISTING_TYPE_REPOSITORY) private readonly listingTypes: IListingTypeRepository,
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly resolveAdministrativeAddress: ResolveAdministrativeAddressUseCase,
    private readonly assertDepositCoverage: AssertListingDepositCoverageUseCase,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tx: PrismaTx,
    tenantId: string,
    id: string,
    input: UpdateListingInput,
    opts?: {
      requirePartnerId?: string;
      modeConfigValidation?: 'draft' | 'bookable';
    },
  ): Promise<ListingRecord> {
    const hasLocationCodes = input.provinceCode !== undefined || input.wardCode !== undefined;
    if (hasLocationCodes && (!input.provinceCode || !input.wardCode)) {
      throw new InvalidListingAdministrativeDivision();
    }
    // Global reference data on its own connection — safe to resolve inside the tx.
    const location =
      input.provinceCode && input.wardCode
        ? await this.resolveAdministrativeAddress.execute(input.provinceCode, input.wardCode)
        : null;

    const existing = await this.listings.findById(tx, id);
    if (!existing) {
      throw new ListingNotFound();
    }
    // Partner-scoped callers may only edit their own listings (§7.3).
    const listing = Listing.rehydrate(existing);
    listing.assertOwnedForEdit(opts?.requirePartnerId);
    if (input.depositPercent !== undefined || input.categoryId !== undefined) {
      const partner = await this.partners.findById(tx, existing.partnerId);
      if (!partner) {
        throw new PartnerNotFound();
      }
      await this.assertDepositCoverage.execute(
        tx,
        {
          partnerId: existing.partnerId,
          listingTypeId: existing.listingTypeId,
          categoryId:
            input.categoryId === undefined ? existing.categoryId : (input.categoryId ?? null),
          isHouse: partner.isHouse,
        },
        input.depositPercent ?? existing.depositPercent,
      );
    }

    const effectiveGroupId = input.groupId === undefined ? existing.groupId : input.groupId;
    const effectiveGroup = effectiveGroupId
      ? await this.groups.findById(tx, effectiveGroupId)
      : null;
    if (effectiveGroupId && !effectiveGroup) {
      throw new ListingGroupNotFound();
    }
    if (input.slug && input.slug !== existing.slug) {
      const other = await this.listings.findBySlug(tx, input.slug);
      if (other && other.id !== id) {
        throw new ListingSlugTaken(input.slug);
      }
    }

    // A re-bound group must belong to the listing's own partner (§7.3) — a
    // partner cannot move a listing under another partner's post.
    if (input.groupId !== undefined && input.groupId !== null) {
      const group = effectiveGroup;
      if (!group) {
        throw new ListingGroupNotFound();
      }
      if (group.partnerId !== existing.partnerId) {
        throw new ListingGroupNotOwned();
      }
      if (group.listingTypeId !== existing.listingTypeId) {
        throw new ListingGroupTypeMismatch();
      }
    }

    let normalizedModeConfig: Record<string, unknown> | undefined;
    // Re-validate attributes / modes / package pricing against the unchanged type.
    if (
      input.attributes !== undefined ||
      input.bookingModes !== undefined ||
      input.modeConfig !== undefined
    ) {
      const type = await this.listingTypes.findById(tx, existing.listingTypeId);
      if (!type) {
        throw new ListingTypeNotFound();
      }
      if (input.attributes !== undefined) {
        assertValidAttributes(type.attributeSchema, input.attributes);
      }
      const bookingModes = input.bookingModes ?? existing.bookingModes;
      if (input.bookingModes !== undefined) {
        Listing.assertBookingModesAllowed(bookingModes, type.allowedModes);
      }
      try {
        normalizedModeConfig = validateAndNormalizeModeConfig({
          bookingSelection: type.bookingSelection,
          bookingModes,
          modeConfig: input.modeConfig ?? existing.modeConfig,
          validationContext: opts?.modeConfigValidation,
        }) as Record<string, unknown>;
      } catch (error) {
        if (error instanceof ListingModeConfigError) {
          throw new ListingPricingRejected(error.code, error.message);
        }
        throw error;
      }
    }

    const updated = await this.listings.update(
      tx,
      id,
      existing.updatedAt,
      listing.applyContentUpdate({
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
        latitude: input.latitude,
        longitude: input.longitude,
        photos: input.photos,
        attributes: input.attributes,
        bookingModes: input.bookingModes,
        modeConfig: normalizedModeConfig,
        stockQuantity: input.stockQuantity,
        capacity: input.capacity,
        bufferBefore: input.bufferBefore,
        bufferAfter: input.bufferAfter,
        approvalRequired: input.approvalRequired,
        depositPercent: input.depositPercent,
        balanceDue: input.balanceDue,
        cancellationPolicyId: input.cancellationPolicyId,
      }),
    );
    if (!updated) throw new ListingStateChanged();
    await this.outbox.emit(tx, {
      tenantId,
      eventType: 'listing.updated',
      payload: { listingId: id },
    });
    return updated;
  }
}
