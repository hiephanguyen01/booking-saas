import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaTx, TenantDbService } from '../../../../../shared/tenant-context/tenant-db.service';
import type { OutboxService } from '../../../../../shared/outbox/outbox.service';
import type { IAuditWriter } from '../../../../../shared/audit/audit-writer.port';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../../domain/ports/listing-group-repository.port';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import { GroupModerationUseCase } from './group-moderation.use-case';

const TX = {} as PrismaTx;
const TENANT = 'tenant-1';
const PARTNER = 'partner-1';
const CTX = { tenantId: TENANT, actorUserId: 'user-1', ip: '127.0.0.1' };

function group(overrides: Partial<ListingGroupRecord> = {}): ListingGroupRecord {
  return {
    id: 'group-1',
    tenantId: TENANT,
    partnerId: PARTNER,
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
    photos: [],
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
    tenantId: TENANT,
    partnerId: PARTNER,
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
    photos: [],
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
    submittedAt: new Date('2026-01-02T00:00:00Z'),
    publishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function build(opts: { group?: ListingGroupRecord; children?: ListingRecord[] } = {}) {
  const groups = {
    findById: vi.fn().mockResolvedValue(opts.group ?? group()),
    moderate: vi.fn().mockImplementation((_tx, id, update) => ({ ...group(), id, ...update })),
  } as unknown as IListingGroupRepository;
  const listings = {
    list: vi.fn().mockResolvedValue(opts.children ?? [child()]),
    moderate: vi.fn().mockImplementation((_tx, id, update) => ({ ...child(), id, ...update })),
  } as unknown as IListingRepository;
  const tenantDb = {
    forTenant: vi.fn((_tenantId: string, fn: (tx: PrismaTx) => unknown) => fn(TX)),
  } as unknown as TenantDbService;
  const outbox = { emit: vi.fn().mockResolvedValue(undefined) } as unknown as OutboxService;
  const audit = { write: vi.fn().mockResolvedValue(undefined) } as unknown as IAuditWriter;

  return {
    groups,
    listings,
    useCase: new GroupModerationUseCase(groups, listings, tenantDb, outbox, audit),
  };
}

describe('GroupModerationUseCase.publish — §7.3 contact-info gate', () => {
  it('publishes a clean post', async () => {
    const { useCase, groups } = build();
    await expect(useCase.publish(CTX, 'group-1')).resolves.toMatchObject({ status: 'published' });
    expect(groups.moderate).toHaveBeenCalled();
  });

  /**
   * The bypass this closes: publishing a group publishes every child listing with
   * it, but only the group's own text was scanned — so a phone number parked in a
   * child's description sailed through the gate the per-listing publish enforces.
   */
  it("blocks the publish when a CHILD's description leaks a phone number", async () => {
    const { useCase, groups, listings } = build({
      children: [child({ description: 'Liên hệ trực tiếp 0901234567 để được giảm giá.' })],
    });

    await expect(useCase.publish(CTX, 'group-1')).rejects.toBeInstanceOf(BadRequestException);
    // Nothing may be published — not the post, not the child.
    expect(groups.moderate).not.toHaveBeenCalled();
    expect(listings.moderate).not.toHaveBeenCalled();
  });

  it('reports which child leaked, so the reviewer can find it', async () => {
    const { useCase } = build({
      children: [child(), child({ id: 'listing-2', description: 'Zalo 0912345678' })],
    });

    const error = await useCase.publish(CTX, 'group-1').catch((e: unknown) => e);
    const response = (error as BadRequestException).getResponse() as {
      code: string;
      details: { type: string; field: string }[];
    };
    expect(response.code).toBe('LISTING_HAS_CONTACT_INFO');
    expect(response.details.map((d) => d.field)).toContain('listings[1].description');
    expect(response.details.map((d) => d.type)).toEqual(
      expect.arrayContaining(['phone', 'zalo']),
    );
  });

  it("blocks on a child's title too", async () => {
    const { useCase } = build({ children: [child({ title: 'Phòng A — call 0987654321' })] });
    await expect(useCase.publish(CTX, 'group-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks on contact info smuggled into a child's photo URL", async () => {
    const { useCase } = build({
      children: [child({ photos: ['https://cdn.example.com/call-0901234567.jpg'] })],
    });
    await expect(useCase.publish(CTX, 'group-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it("still blocks on the post's OWN contact info", async () => {
    const { useCase } = build({ group: group({ description: 'Hotline 0901234567' }) });
    await expect(useCase.publish(CTX, 'group-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets a reviewer force past the gate, and records that in the audit', async () => {
    const { useCase, groups } = build({
      children: [child({ description: 'Liên hệ 0901234567' })],
    });
    await expect(useCase.publish(CTX, 'group-1', true)).resolves.toMatchObject({
      status: 'published',
    });
    expect(groups.moderate).toHaveBeenCalled();
  });

  it('stamps publishedAt on a child the first time it is published', async () => {
    const { useCase, listings } = build();
    await useCase.publish(CTX, 'group-1');
    expect(listings.moderate).toHaveBeenCalledWith(
      TX,
      'listing-1',
      expect.objectContaining({ status: 'published', publishedAt: expect.any(Date) }),
    );
  });

  it('keeps the original publishedAt when a child is re-published', async () => {
    const firstPublish = new Date('2026-02-01T00:00:00Z');
    const { useCase, listings } = build({
      group: group({ status: 'archived', hiddenBy: 'admin' }),
      children: [child({ status: 'archived', hiddenBy: 'admin', publishedAt: firstPublish })],
    });
    await useCase.republish(CTX, 'group-1', 'admin');
    expect(listings.moderate).toHaveBeenCalledWith(
      TX,
      'listing-1',
      expect.objectContaining({ status: 'published', publishedAt: undefined }),
    );
  });
});
