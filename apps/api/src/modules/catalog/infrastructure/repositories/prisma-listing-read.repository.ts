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
    const nearbyCards = filter.nearby
      ? await this.findNearestCardIds(tx, filter.typeSlug!, filter.nearby)
      : [];
    if (filter.nearby && nearbyCards.length === 0) return [];
    const nearbyDistance = new Map<string, number>();
    const standaloneIds: string[] = [];
    const groupIds: string[] = [];
    for (const card of nearbyCards) {
      nearbyDistance.set(`${card.kind}:${card.id}`, card.distanceMeters);
      if (card.kind === 'listing') standaloneIds.push(card.id);
      else groupIds.push(card.id);
    }
    const attrConditions: Prisma.ListingWhereInput[] = Object.entries(filter.attrFilters).map(
      ([key, value]) => ({ attributes: { path: [key], equals: value } }),
    );
    const items = await tx.listing.findMany({
      where: {
        status: 'published',
        partner: {
          status: 'approved',
          ...(filter.partnerSlug ? { slug: filter.partnerSlug } : {}),
        },
        ...(filter.typeSlug ? { listingType: { slug: filter.typeSlug, isActive: true } } : {}),
        ...(filter.category ? { category: { slug: filter.category } } : {}),
        AND: [
          ...attrConditions,
          { OR: [{ groupId: null }, { group: { status: 'published' } }] },
          ...(filter.nearby
            ? [
                {
                  OR: [
                    ...(standaloneIds.length ? [{ id: { in: standaloneIds }, groupId: null }] : []),
                    ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
                  ],
                },
              ]
            : []),
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
        listingType: { select: { slug: true, itemLabel: true, bookingSelection: true } },
        partner: { select: { slug: true } },
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
              select: {
                date: true,
                type: true,
                windows: true,
                openTime: true,
                closeTime: true,
              },
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
            latitude: true,
            longitude: true,
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
      partnerSlug: l.partner.slug,
      attributes: (l.attributes ?? {}) as Record<string, unknown>,
      photos: (l.photos ?? []) as unknown[],
      modeConfig: (l.modeConfig ?? {}) as Record<string, unknown>,
      bookingModes: l.bookingModes as BookingMode[],
      bookingSelection: l.listingType.bookingSelection,
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
      latitude: l.latitude,
      longitude: l.longitude,
      ...(filter.nearby
        ? {
            distanceMeters:
              nearbyDistance.get(`${l.group ? 'group' : 'listing'}:${l.group?.id ?? l.id}`) ?? 0,
          }
        : {}),
      publishedAt: l.publishedAt,
      completedBookings: l._count.bookings,
      ratingAvg: l.ratingAvg === null ? null : l.ratingAvg.toNumber(),
      reviewCount: l.reviewCount,
      availabilityRules: l.availabilityRules,
      // Listed field by field: `...r` carried every pricing_rules column (tenant_id,
      // listing_id, timestamps…) into a record the public search response is built
      // from — persistence keys must not ride along by default.
      pricingRules: l.pricingRules.map((r) => ({
        id: r.id,
        bookingMode: r.bookingMode as BookingMode,
        ruleType: r.ruleType,
        params: (r.params ?? {}) as Record<string, unknown>,
        price: r.price.toString(),
        salePrice: r.salePrice?.toString() ?? null,
        priority: r.priority,
      })),
      availabilityExceptions: l.resource.availabilityExceptions.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        type: e.type,
        // A `custom_hours` day can have several windows (a lunch break); the
        // search's open-hours check reads them through the shared kernel.
        windows: Array.isArray(e.windows)
          ? (e.windows as unknown[]).flatMap((value) => {
              const window = value as { openTime?: unknown; closeTime?: unknown };
              return typeof window.openTime === 'string' && typeof window.closeTime === 'string'
                ? [{ openTime: window.openTime, closeTime: window.closeTime }]
                : [];
            })
          : null,
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
            latitude: l.group.latitude,
            longitude: l.group.longitude,
            ratingAvg: l.group.ratingAvg === null ? null : l.group.ratingAvg.toNumber(),
            reviewCount: l.group.reviewCount,
          }
        : null,
    }));
  }

  private async findNearestCardIds(
    tx: PrismaTx,
    typeSlug: string,
    nearby: { latitude: number; longitude: number; limit: number },
  ): Promise<Array<{ id: string; kind: 'listing' | 'group'; distanceMeters: number }>> {
    return tx.$queryRaw<Array<{ id: string; kind: 'listing' | 'group'; distanceMeters: number }>>(
      Prisma.sql`
        WITH origin AS (
          SELECT ll_to_earth(${nearby.latitude}, ${nearby.longitude}) AS point
        ),
        standalone AS (
          SELECT
            l.id,
            'listing'::text AS kind,
            earth_distance(ll_to_earth(l.latitude, l.longitude), origin.point) AS distance,
            l.published_at AS published_at
          FROM listings l
          JOIN listing_types lt ON lt.id = l.listing_type_id
          JOIN partners p ON p.id = l.partner_id
          CROSS JOIN origin
          WHERE l.tenant_id = current_setting('app.tenant_id')::uuid
            AND l.group_id IS NULL
            AND l.status = 'published'
            AND l.latitude IS NOT NULL
            AND l.longitude IS NOT NULL
            AND lt.slug = ${typeSlug}
            AND lt.is_active = true
            AND p.status = 'approved'
          ORDER BY ll_to_earth(l.latitude, l.longitude) <-> origin.point,
            l.published_at DESC NULLS LAST,
            l.id
          LIMIT ${nearby.limit}
        ),
        grouped AS (
          SELECT
            g.id,
            'group'::text AS kind,
            earth_distance(ll_to_earth(g.latitude, g.longitude), origin.point) AS distance,
            MAX(l.published_at) AS published_at
          FROM listing_groups g
          JOIN listing_types lt ON lt.id = g.listing_type_id
          JOIN partners p ON p.id = g.partner_id
          JOIN listings l ON l.group_id = g.id AND l.status = 'published'
          CROSS JOIN origin
          WHERE g.tenant_id = current_setting('app.tenant_id')::uuid
            AND g.status = 'published'
            AND g.latitude IS NOT NULL
            AND g.longitude IS NOT NULL
            AND lt.slug = ${typeSlug}
            AND lt.is_active = true
            AND p.status = 'approved'
          GROUP BY g.id, g.latitude, g.longitude, origin.point
          ORDER BY ll_to_earth(g.latitude, g.longitude) <-> origin.point,
            MAX(l.published_at) DESC NULLS LAST,
            g.id
          LIMIT ${nearby.limit}
        )
        SELECT
          candidates.id,
          candidates.kind,
          ROUND(candidates.distance)::int AS "distanceMeters"
        FROM (
          SELECT * FROM standalone
          UNION ALL
          SELECT * FROM grouped
        ) candidates
        ORDER BY candidates.distance, candidates.published_at DESC NULLS LAST, candidates.id
        LIMIT ${nearby.limit}
      `,
    );
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
