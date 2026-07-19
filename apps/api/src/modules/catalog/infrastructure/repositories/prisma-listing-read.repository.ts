import { Injectable } from '@nestjs/common';
import { Prisma, type BookingMode } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  BusyRangeRecord,
  IListingReadRepository,
  InventoryUsageRecord,
  PublicListingFilter,
  PublicListingRecord,
} from '../../domain/ports/listing-read-repository.port';

@Injectable()
export class PrismaListingReadRepository implements IListingReadRepository {
  async findPublished(tx: PrismaTx, filter: PublicListingFilter): Promise<PublicListingRecord[]> {
    const attrConditions: Prisma.ListingWhereInput[] = Object.entries(filter.attrFilters).map(
      ([key, value]) => ({ attributes: { path: [key], equals: value } }),
    );
    const items = await tx.listing.findMany({
      where: {
        status: 'published',
        ...(filter.typeSlug ? { listingType: { slug: filter.typeSlug, isActive: true } } : {}),
        ...(filter.category ? { category: { slug: filter.category } } : {}),
        AND: [
          ...attrConditions,
          { OR: [{ groupId: null }, { group: { status: 'published' } }] },
          ...(filter.q
            ? [
                {
                  OR: [
                    { title: { contains: filter.q, mode: 'insensitive' as const } },
                    { group: { title: { contains: filter.q, mode: 'insensitive' as const } } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        listingType: { select: { slug: true, itemLabel: true } },
        resource: {
          select: {
            id: true,
            timezone: true,
            availabilityExceptions: {
              where:
                filter.exceptionFrom || filter.exceptionTo
                  ? { date: { gte: filter.exceptionFrom, lte: filter.exceptionTo } }
                  : undefined,
              take: filter.exceptionFrom || filter.exceptionTo ? undefined : 0,
              select: { date: true, type: true, openTime: true, closeTime: true },
            },
          },
        },
        availabilityRules: {
          select: { dayOfWeek: true, openTime: true, closeTime: true },
        },
        pricingRules: {
          select: {
            id: true,
            bookingMode: true,
            ruleType: true,
            params: true,
            price: true,
            salePrice: true,
            priority: true,
          },
        },
        group: {
          select: {
            id: true,
            title: true,
            slug: true,
            photos: true,
            amenities: true,
            provinceCode: true,
            provinceName: true,
            wardCode: true,
            wardName: true,
            address: true,
            ratingAvg: true,
            reviewCount: true,
          },
        },
        _count: { select: { bookings: { where: { status: 'completed' } } } },
      },
    });

    return items.map((l) => ({
      id: l.id,
      title: l.title,
      slug: l.slug,
      listingTypeSlug: l.listingType.slug,
      attributes: (l.attributes ?? {}) as Record<string, unknown>,
      photos: (l.photos ?? []) as unknown[],
      modeConfig: (l.modeConfig ?? {}) as Record<string, unknown>,
      bookingModes: l.bookingModes as BookingMode[],
      capacity: l.capacity,
      stockQuantity: l.stockQuantity,
      bufferBefore: l.bufferBefore,
      bufferAfter: l.bufferAfter,
      depositPercent: l.depositPercent,
      resourceId: l.resource.id,
      resourceTimezone: l.resource.timezone,
      provinceCode: l.provinceCode,
      provinceName: l.provinceName,
      wardCode: l.wardCode,
      wardName: l.wardName,
      address: l.address,
      publishedAt: l.publishedAt,
      completedBookings: l._count.bookings,
      ratingAvg: l.ratingAvg === null ? null : l.ratingAvg.toNumber(),
      reviewCount: l.reviewCount,
      availabilityRules: l.availabilityRules,
      pricingRules: l.pricingRules.map((r) => ({
        ...r,
        bookingMode: r.bookingMode as BookingMode,
        params: (r.params ?? {}) as Record<string, unknown>,
        price: r.price.toString(),
        salePrice: r.salePrice?.toString() ?? null,
      })),
      availabilityExceptions: l.resource.availabilityExceptions.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        type: e.type,
        openTime: e.openTime,
        closeTime: e.closeTime,
      })),
      group: l.group
        ? {
            id: l.group.id,
            title: l.group.title,
            slug: l.group.slug,
            photos: (l.group.photos ?? []) as unknown[],
            amenities: (l.group.amenities ?? []) as unknown[],
            itemLabel: l.listingType.itemLabel,
            provinceCode: l.group.provinceCode,
            provinceName: l.group.provinceName,
            wardCode: l.group.wardCode,
            wardName: l.group.wardName,
            address: l.group.address,
            ratingAvg: l.group.ratingAvg === null ? null : l.group.ratingAvg.toNumber(),
            reviewCount: l.group.reviewCount,
          }
        : null,
    }));
  }

  async busyRanges(
    tx: PrismaTx,
    resourceIds: string[],
    fromUtc: Date,
    toUtc: Date,
  ): Promise<BusyRangeRecord[]> {
    if (!resourceIds.length) return [];
    return tx.$queryRaw<BusyRangeRecord[]>(Prisma.sql`
      SELECT resource_id AS "resourceId", lower(blocked_period) AS "start", upper(blocked_period) AS "end"
      FROM bookings
      WHERE resource_id IN (${Prisma.join(resourceIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND status IN ('pending_payment', 'pending_approval', 'confirmed')
        AND booking_mode NOT IN ('inventory', 'class')
        AND blocked_period && tstzrange(${fromUtc}, ${toUtc}, '[)')`);
  }

  async inventoryUsage(
    tx: PrismaTx,
    listingIds: string[],
    fromUtc: Date,
    toUtc: Date,
  ): Promise<InventoryUsageRecord[]> {
    if (!listingIds.length) return [];
    return tx.$queryRaw<InventoryUsageRecord[]>(Prisma.sql`
      SELECT listing_id AS "listingId", COALESCE(SUM(quantity), 0)::int AS "used"
      FROM bookings
      WHERE listing_id IN (${Prisma.join(listingIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND booking_mode = 'inventory'
        AND status IN ('pending_payment', 'pending_approval', 'confirmed')
        AND returned_at IS NULL
        AND (blocked_period && tstzrange(${fromUtc}, ${toUtc}, '[)') OR upper(blocked_period) <= now())
      GROUP BY listing_id`);
  }
}
