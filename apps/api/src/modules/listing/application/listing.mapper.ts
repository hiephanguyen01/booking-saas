import type {
  CancellationPolicyResponse,
  ListingGroupResponse,
  ListingResponse,
  PricingRuleResponse,
  PublicListingDetailWithTimezoneResponse,
  PublicListingGroupDetailResponse,
  ResourceResponse,
} from '@booking/contracts';
import type { ListingTypeRecord } from '../../catalog/domain/ports/listing-type-repository.port';
import { computeGroupStats } from '../domain/group-stats';
import type { CancellationPolicyRecord } from '../domain/ports/cancellation-policy-repository.port';
import type { ListingGroupRecord } from '../domain/ports/listing-group-repository.port';
import type { ListingRecord, PublicListingRecord } from '../domain/ports/listing-repository.port';
import type { ResourceRecord } from '../domain/ports/resource-repository.port';
import type { PricingRuleRecord } from '../domain/ports/pricing-rule-repository.port';
import { publicModeConfig } from '../../../shared/domain/pricing/package-config';
import { lowestBasePrice } from '../../../shared/domain/pricing/base-prices';

/**
 * A cancellation policy for the partner management screen. `defaultPolicyId` is the
 * caller's current default (partner-level or tenant-level) so the row can flag itself.
 */
export function toCancellationPolicyResponse(
  p: CancellationPolicyRecord,
  defaultPolicyId: string | null,
): CancellationPolicyResponse {
  return {
    id: p.id,
    tenantId: p.tenantId,
    partnerId: p.partnerId,
    name: p.name,
    rules: p.rules,
    isDefault: defaultPolicyId !== null && p.id === defaultPolicyId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toListingGroupResponse(g: ListingGroupRecord): ListingGroupResponse {
  return {
    id: g.id,
    tenantId: g.tenantId,
    partnerId: g.partnerId,
    listingTypeId: g.listingTypeId,
    title: g.title,
    slug: g.slug,
    description: g.description,
    provinceCode: g.provinceCode,
    provinceName: g.provinceName,
    wardCode: g.wardCode,
    wardName: g.wardName,
    address: g.address,
    workingArea: g.workingArea,
    amenities: g.amenities,
    photos: g.photos,
    status: g.status,
    publishedBy: g.publishedBy,
    hiddenBy: g.hiddenBy,
    ...computeGroupStats(g.children),
    ratingAvg: g.ratingAvg,
    reviewCount: g.reviewCount,
    bookingCount: g.bookingCount,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

export function toListingResponse(l: ListingRecord): ListingResponse {
  return {
    id: l.id,
    tenantId: l.tenantId,
    partnerId: l.partnerId,
    listingTypeId: l.listingTypeId,
    resourceId: l.resourceId,
    groupId: l.groupId,
    categoryId: l.categoryId,
    title: l.title,
    slug: l.slug,
    description: l.description,
    provinceCode: l.provinceCode,
    provinceName: l.provinceName,
    wardCode: l.wardCode,
    wardName: l.wardName,
    address: l.address,
    photos: l.photos,
    attributes: l.attributes,
    bookingModes: l.bookingModes,
    bookingSelection: l.bookingSelection,
    modeConfig: l.modeConfig,
    stockQuantity: l.stockQuantity,
    capacity: l.capacity,
    bufferBefore: l.bufferBefore,
    bufferAfter: l.bufferAfter,
    approvalRequired: l.approvalRequired,
    depositPercent: l.depositPercent,
    balanceDue: l.balanceDue,
    rescheduleAllowed: l.rescheduleAllowed,
    rescheduleDeadlineHours: l.rescheduleDeadlineHours,
    rescheduleFee: l.rescheduleFee,
    cancellationPolicyId: l.cancellationPolicyId,
    cancellationPolicy: l.cancellationPolicy,
    effectiveCancellationPolicy: l.effectiveCancellationPolicy,
    effectiveCancellationPolicySource: l.effectiveCancellationPolicySource,
    partner: l.partner,
    ratingAvg: l.ratingAvg,
    reviewCount: l.reviewCount,
    status: l.status,
    publishedBy: l.publishedBy,
    hiddenBy: l.hiddenBy,
    submittedAt: l.submittedAt?.toISOString() ?? null,
    publishedAt: l.publishedAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

export function toResourceResponse(r: ResourceRecord): ResourceResponse {
  return {
    id: r.id,
    tenantId: r.tenantId,
    partnerId: r.partnerId,
    name: r.name,
    timezone: r.timezone,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toPricingRuleResponse(p: PricingRuleRecord): PricingRuleResponse {
  return {
    id: p.id,
    tenantId: p.tenantId,
    listingId: p.listingId,
    bookingMode: p.bookingMode,
    ruleType: p.ruleType,
    params: p.params,
    price: p.price,
    salePrice: p.salePrice,
    priority: p.priority,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toPublicListingDetailResponse(
  l: PublicListingRecord,
): PublicListingDetailWithTimezoneResponse {
  return {
    id: l.id,
    title: l.title,
    slug: l.slug,
    description: l.description,
    provinceCode: l.provinceCode,
    provinceName: l.provinceName,
    wardCode: l.wardCode,
    wardName: l.wardName,
    address: l.address,
    photos: l.photos,
    attributes: l.attributes,
    attributeSchema: l.attributeSchema,
    bookingModes: l.bookingModes,
    bookingSelection: l.bookingSelection,
    modeConfig: publicModeConfig(l.modeConfig),
    depositPercent: l.depositPercent,
    listingTypeSlug: l.listingTypeSlug,
    timezone: l.resourceTimezone,
    group: l.group,
    cancellationPolicy: l.cancellationPolicy,
    effectiveCancellationPolicy: l.effectiveCancellationPolicy,
    effectiveCancellationPolicySource: l.effectiveCancellationPolicySource,
    ratingAvg: l.ratingAvg,
    reviewCount: l.reviewCount,
    trust: {
      identityVerified: l.partnerVerifiedAt !== null,
      partnerActiveSince: l.partnerActiveSince.toISOString(),
      partnerName: l.partnerName,
      partnerSlug: l.partnerSlug,
      partnerLogoUrl: l.partnerLogoUrl,
      completedBookings: l.completedBookings,
      avgApprovalResponseSeconds: l.avgApprovalResponseSeconds,
    },
  };
}

/**
 * The public post (listing_group) detail page (§7.3).
 *
 * `listingType` is nullable because the group only carries `listingTypeId`; the
 * fallbacks below are what the page renders if that row ever goes missing rather
 * than 500-ing on a detail page. Only PUBLISHED children are exposed — a group
 * can legitimately hold drafts, and a draft must never reach the storefront.
 */
export function toPublicListingGroupDetailResponse(
  group: ListingGroupRecord,
  children: readonly ListingRecord[],
  listingType: ListingTypeRecord | null,
): PublicListingGroupDetailResponse {
  const partner = group.partnerPublic;
  return {
    id: group.id,
    title: group.title,
    slug: group.slug,
    description: group.description,
    provinceCode: group.provinceCode,
    provinceName: group.provinceName,
    wardCode: group.wardCode,
    wardName: group.wardName,
    address: group.address,
    workingArea: group.workingArea,
    amenities: group.amenities,
    photos: group.photos,
    listingTypeSlug: listingType?.slug ?? '',
    attributeSchema: listingType?.attributeSchema ?? [],
    bookingSelection: listingType?.bookingSelection ?? 'flexible_duration',
    itemLabel: listingType?.itemLabel?.trim() || 'hạng mục',
    ratingAvg: group.ratingAvg,
    reviewCount: group.reviewCount,
    trust: {
      identityVerified: partner.verifiedAt !== null,
      partnerActiveSince: partner.createdAt.toISOString(),
      partnerName: partner.name,
      partnerSlug: partner.slug,
      partnerLogoUrl: partner.logoUrl,
      completedBookings: group.bookingCount,
      avgApprovalResponseSeconds: null,
    },
    listings: children
      .filter((listing) => listing.status === 'published')
      .map((listing) => ({
        id: listing.id,
        title: listing.title,
        slug: listing.slug,
        description: listing.description,
        photos: listing.photos,
        attributes: listing.attributes,
        bookingModes: listing.bookingModes,
        priceFrom: lowestBasePrice(listing),
        ratingAvg: listing.ratingAvg,
        reviewCount: listing.reviewCount,
      })),
  };
}
