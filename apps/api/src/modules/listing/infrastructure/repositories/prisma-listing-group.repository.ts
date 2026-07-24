import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  BookingMode,
  BookingSelection,
  ModerationActor,
  PublishStatus,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  IListingGroupRepository,
  ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import type { ModerationUpdate } from '../../domain/ports/listing-repository.port';
import type {
  ListingGroupContentPatch,
  NewListingGroup,
} from '../../domain/entities/listing-group.entity';

/**
 * The child fields the post's aggregates are computed from (see
 * `domain/group-stats.ts`). Applied to every group query so `listingCount` /
 * `readyListingCount` / `priceFrom` never cost a follow-up round trip.
 */
const GROUP_INCLUDE = {
  partner: {
    select: {
      name: true,
      slug: true,
      status: true,
      verifiedAt: true,
      createdAt: true,
      businessInfo: true,
    },
  },
  listings: {
    select: {
      description: true,
      photos: true,
      bookingModes: true,
      modeConfig: true,
      listingType: { select: { bookingSelection: true } },
    },
  },
} as const satisfies Prisma.ListingGroupInclude;

type Row = Prisma.ListingGroupGetPayload<{ include: typeof GROUP_INCLUDE }>;

function toRecord(g: Row): ListingGroupRecord {
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
    amenities: (g.amenities ?? []) as string[],
    photos: (g.photos ?? []) as string[],
    status: g.status,
    publishedBy: g.publishedBy as ModerationActor | null,
    hiddenBy: g.hiddenBy as ModerationActor | null,
    // Decimal(3,2) → number: a 1–5 rating with 2dp is exact in a float64, and it
    // is a display statistic, never money.
    ratingAvg: g.ratingAvg === null ? null : g.ratingAvg.toNumber(),
    reviewCount: g.reviewCount,
    bookingCount: g.bookingCount,
    partnerPublic: {
      name: g.partner.name,
      slug: g.partner.slug,
      status: g.partner.status,
      verifiedAt: g.partner.verifiedAt,
      createdAt: g.partner.createdAt,
      logoUrl:
        typeof (g.partner.businessInfo as Record<string, unknown>)['logoUrl'] === 'string'
          ? ((g.partner.businessInfo as Record<string, unknown>)['logoUrl'] as string)
          : null,
    },
    children: g.listings.map((l) => ({
      description: l.description,
      photos: (l.photos ?? []) as string[],
      bookingModes: l.bookingModes as BookingMode[],
      bookingSelection: l.listingType.bookingSelection as BookingSelection,
      modeConfig: (l.modeConfig ?? {}) as Record<string, unknown>,
    })),
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

@Injectable()
export class PrismaListingGroupRepository implements IListingGroupRepository {
  async create(tx: PrismaTx, tenantId: string, data: NewListingGroup): Promise<ListingGroupRecord> {
    return toRecord(
      await tx.listingGroup.create({
        data: {
          tenantId,
          partnerId: data.partnerId,
          listingTypeId: data.listingTypeId,
          title: data.title,
          slug: data.slug,
          description: data.description ?? null,
          provinceCode: data.provinceCode ?? null,
          provinceName: data.provinceName ?? null,
          wardCode: data.wardCode ?? null,
          wardName: data.wardName ?? null,
          address: data.address ?? null,
          workingArea: data.workingArea ?? null,
          amenities: data.amenities as Prisma.InputJsonValue,
          photos: data.photos as Prisma.InputJsonValue,
        },
        include: GROUP_INCLUDE,
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<ListingGroupRecord | null> {
    const g = await tx.listingGroup.findUnique({ where: { id }, include: GROUP_INCLUDE });
    return g ? toRecord(g) : null;
  }

  async findBySlug(tx: PrismaTx, slug: string): Promise<ListingGroupRecord | null> {
    const g = await tx.listingGroup.findFirst({ where: { slug }, include: GROUP_INCLUDE });
    return g ? toRecord(g) : null;
  }

  async list(tx: PrismaTx, filter: { partnerId?: string } = {}): Promise<ListingGroupRecord[]> {
    const items = await tx.listingGroup.findMany({
      where: filter.partnerId ? { partnerId: filter.partnerId } : {},
      orderBy: { createdAt: 'desc' },
      include: GROUP_INCLUDE,
    });
    return items.map(toRecord);
  }

  async listPage(
    tx: PrismaTx,
    filter: { partnerId?: string; q?: string },
    page: { page: number; pageSize: number },
  ): Promise<{ items: ListingGroupRecord[]; total: number }> {
    const where: Prisma.ListingGroupWhereInput = {
      ...(filter.partnerId ? { partnerId: filter.partnerId } : {}),
      ...(filter.q ? { title: { contains: filter.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      tx.listingGroup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: GROUP_INCLUDE,
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      tx.listingGroup.count({ where }),
    ]);
    return { items: items.map(toRecord), total };
  }

  async update(
    tx: PrismaTx,
    id: string,
    expectedUpdatedAt: Date,
    data: ListingGroupContentPatch,
  ): Promise<ListingGroupRecord | null> {
    const changed = await tx.listingGroup.updateMany({
      where: { id, updatedAt: expectedUpdatedAt },
      data: {
        partnerId: data.partnerId,
        listingTypeId: data.listingTypeId,
        title: data.title,
        slug: data.slug,
        description: data.description,
        provinceCode: data.provinceCode,
        provinceName: data.provinceName,
        wardCode: data.wardCode,
        wardName: data.wardName,
        address: data.address,
        workingArea: data.workingArea,
        amenities: data.amenities as Prisma.InputJsonValue | undefined,
        photos: data.photos as Prisma.InputJsonValue | undefined,
      },
    });
    if (changed.count === 0) return null;
    const updated = await tx.listingGroup.findUnique({ where: { id }, include: GROUP_INCLUDE });
    return updated ? toRecord(updated) : null;
  }

  /**
   * `listing_groups` has no submitted_at/published_at columns (only `listings`
   * does), so the timestamps on `ModerationUpdate` are intentionally ignored here.
   */
  async moderate(
    tx: PrismaTx,
    id: string,
    expectedStatus: PublishStatus,
    update: ModerationUpdate,
  ): Promise<ListingGroupRecord | null> {
    const changed = await tx.listingGroup.updateMany({
      where: { id, status: expectedStatus },
      data: { status: update.status, publishedBy: update.publishedBy, hiddenBy: update.hiddenBy },
    });
    if (changed.count === 0) return null;
    const updated = await tx.listingGroup.findUnique({ where: { id }, include: GROUP_INCLUDE });
    return updated ? toRecord(updated) : null;
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.listingGroup.delete({ where: { id } });
  }

  countListings(tx: PrismaTx, groupId: string): Promise<number> {
    return tx.listing.count({ where: { groupId } });
  }
}
