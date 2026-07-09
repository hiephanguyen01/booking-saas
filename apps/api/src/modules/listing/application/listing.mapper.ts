import type {
  ListingGroupResponse,
  ListingResponse,
  PricingRuleResponse,
  PublicListingDetailResponse,
  ResourceResponse,
} from '@booking/shared';
import type { ListingGroupRecord } from '../domain/ports/listing-group-repository.port';
import type { ListingRecord, PublicListingRecord } from '../domain/ports/listing-repository.port';
import type { ResourceRecord } from '../domain/ports/resource-repository.port';
import type { PricingRuleRecord } from '../domain/ports/pricing-rule-repository.port';

export function toListingGroupResponse(g: ListingGroupRecord): ListingGroupResponse {
  return {
    id: g.id,
    tenantId: g.tenantId,
    partnerId: g.partnerId,
    listingTypeId: g.listingTypeId,
    title: g.title,
    slug: g.slug,
    description: g.description,
    address: g.address,
    workingArea: g.workingArea,
    amenities: g.amenities,
    photos: g.photos,
    status: g.status,
    publishedBy: g.publishedBy,
    hiddenBy: g.hiddenBy,
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
    photos: l.photos,
    attributes: l.attributes,
    bookingModes: l.bookingModes,
    modeConfig: l.modeConfig,
    stockQuantity: l.stockQuantity,
    capacity: l.capacity,
    bufferBefore: l.bufferBefore,
    bufferAfter: l.bufferAfter,
    approvalRequired: l.approvalRequired,
    depositPercent: l.depositPercent,
    balanceDue: l.balanceDue,
    cancellationPolicyId: l.cancellationPolicyId,
    status: l.status,
    publishedBy: l.publishedBy,
    hiddenBy: l.hiddenBy,
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
    priority: p.priority,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toPublicListingDetailResponse(l: PublicListingRecord): PublicListingDetailResponse {
  return {
    id: l.id,
    title: l.title,
    slug: l.slug,
    description: l.description,
    photos: l.photos,
    attributes: l.attributes,
    bookingModes: l.bookingModes,
    modeConfig: l.modeConfig,
    depositPercent: l.depositPercent,
    listingTypeSlug: l.listingTypeSlug,
    trust: {
      identityVerified: l.partnerVerifiedAt !== null,
      partnerActiveSince: l.partnerActiveSince.toISOString(),
      partnerName: l.partnerName,
      completedBookings: l.completedBookings,
      avgApprovalResponseSeconds: l.avgApprovalResponseSeconds,
    },
  };
}
