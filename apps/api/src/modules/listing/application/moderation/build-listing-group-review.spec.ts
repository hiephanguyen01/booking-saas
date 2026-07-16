import { describe, expect, it } from 'vitest';
import type { ListingGroupRecord } from '../../domain/ports/listing-group-repository.port';
import type { ListingRecord } from '../../domain/ports/listing-repository.port';
import { buildListingGroupReview, groupContactFlags } from './build-listing-group-review';

function group(overrides: Partial<ListingGroupRecord> = {}): ListingGroupRecord {
  return {
    id: 'group-1',
    tenantId: 'tenant-1',
    partnerId: 'partner-1',
    listingTypeId: 'type-1',
    title: 'Studio Sài Gòn',
    slug: 'studio-sai-gon',
    description: 'Không gian chụp ảnh rộng rãi.',
    provinceCode: '79',
    provinceName: 'TP.HCM',
    wardCode: '26740',
    wardName: 'Phường Bến Nghé',
    address: '12 Nguyễn Huệ',
    workingArea: null,
    amenities: [],
    photos: ['https://cdn.example.com/post.jpg'],
    status: 'pending_review',
    publishedBy: null,
    hiddenBy: null,
    ratingAvg: null,
    bookingCount: 0,
    children: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function child(overrides: Partial<ListingRecord> = {}): ListingRecord {
  return {
    id: 'listing-1',
    tenantId: 'tenant-1',
    partnerId: 'partner-1',
    listingTypeId: 'type-1',
    resourceId: 'resource-1',
    groupId: 'group-1',
    categoryId: null,
    title: 'Phòng A',
    slug: 'phong-a',
    description: 'Phòng chụp có ánh sáng tự nhiên.',
    provinceCode: '79',
    provinceName: 'TP.HCM',
    wardCode: '26740',
    wardName: 'Phường Bến Nghé',
    address: '12 Nguyễn Huệ',
    photos: ['https://cdn.example.com/a.jpg'],
    attributes: {},
    bookingModes: ['hourly'],
    modeConfig: { hourly: { basePrice: '300000' } },
    stockQuantity: null,
    capacity: null,
    bufferBefore: 0,
    bufferAfter: 0,
    approvalRequired: false,
    depositPercent: 100,
    balanceDue: 'online_before',
    rescheduleAllowed: false,
    rescheduleDeadlineHours: null,
    rescheduleFee: null,
    cancellationPolicyId: 'policy-1',
    cancellationPolicy: { id: 'policy-1', name: 'Linh hoạt', rules: {} },
    partner: { name: 'Studio Co', verificationStatus: 'verified' },
    status: 'pending_review',
    publishedBy: null,
    hiddenBy: null,
    submittedAt: null,
    publishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const passed = (review: { checklist: { key: string; passed: boolean }[] }, key: string): boolean =>
  review.checklist.find((i) => i.key === key)!.passed;

describe('groupContactFlags', () => {
  it('is empty for a clean post and clean items', () => {
    expect(groupContactFlags(group(), [child()])).toEqual([]);
  });

  it("namespaces a child's flag so the reviewer can find the item", () => {
    const flags = groupContactFlags(group(), [
      child(),
      child({ description: 'Gọi 0901234567' }),
    ]);
    expect(flags).toEqual([
      { type: 'phone', field: 'listings[1].description', match: '0901234567' },
    ]);
  });

  it("leaves the post's own flags un-namespaced", () => {
    const flags = groupContactFlags(group({ description: 'Hotline 0901234567' }), []);
    expect(flags[0]!.field).toBe('description');
  });

  it('scans the post AND every item in one pass', () => {
    const flags = groupContactFlags(group({ description: 'Hotline 0901234567' }), [
      child({ description: 'Zalo nhé' }),
    ]);
    expect(flags.map((f) => f.type).sort()).toEqual(['phone', 'zalo']);
  });
});

describe('buildListingGroupReview', () => {
  it('passes a complete post with a complete item', () => {
    const review = buildListingGroupReview(group(), [child()]);
    expect(review.checklistPassed).toBe(true);
    expect(review.contactFlags).toEqual([]);
    expect(review.groupId).toBe('group-1');
    expect(review.status).toBe('pending_review');
  });

  it('never passes an empty post — there is nothing to book', () => {
    const review = buildListingGroupReview(group(), []);
    expect(review.checklistPassed).toBe(false);
    expect(passed(review, 'price')).toBe(false);
    expect(review.listings).toEqual([]);
  });

  it('checks photos and description on the POST, not the items', () => {
    const review = buildListingGroupReview(group({ photos: [], description: null }), [child()]);
    expect(passed(review, 'photos')).toBe(false);
    expect(passed(review, 'description')).toBe(false);
    // The item is fine, so the item-level rows still pass.
    expect(passed(review, 'price')).toBe(true);
    expect(passed(review, 'cancellation_policy')).toBe(true);
  });

  it('fails the price row when ANY item lacks a price', () => {
    const review = buildListingGroupReview(group(), [
      child(),
      child({ id: 'listing-2', modeConfig: {} }),
    ]);
    expect(passed(review, 'price')).toBe(false);
    expect(review.checklistPassed).toBe(false);
  });

  it('fails the cancellation-policy row when ANY item lacks one', () => {
    const review = buildListingGroupReview(group(), [
      child(),
      child({ id: 'listing-2', cancellationPolicyId: null }),
    ]);
    expect(passed(review, 'cancellation_policy')).toBe(false);
  });

  it("does not let an item's missing photo fail the post's price row", () => {
    // Each row must mean exactly what it says — a photo problem is not a price problem.
    const review = buildListingGroupReview(group(), [child({ photos: [] })]);
    expect(passed(review, 'price')).toBe(true);
    expect(passed(review, 'photos')).toBe(true);
  });

  it('includes a per-item review, in order', () => {
    const review = buildListingGroupReview(group(), [child(), child({ id: 'listing-2' })]);
    expect(review.listings.map((r) => r.listingId)).toEqual(['listing-1', 'listing-2']);
  });
});
