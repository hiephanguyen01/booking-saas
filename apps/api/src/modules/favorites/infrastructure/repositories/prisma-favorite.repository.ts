import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  FavoriteTarget,
  PartnerFavoritesQuery,
  TenantFavoritesQuery,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  FavoritableTarget,
  NewFavorite,
} from '../../domain/entities/favorite.entity';
import type { IFavoriteRepository } from '../../domain/ports/favorite-repository.port';
import type {
  CustomerFavoritePage,
  FavoriteCardRecord,
  FavoriteEntryRecord,
  FavoriteListPage,
  FavoriteSummaryRecord,
  FavoriteSummaryTargetRecord,
  IFavoriteReader,
} from '../../domain/ports/favorite-reader.port';

/** VND đồng from a mode_config price value — accepts digit string OR seeded integer. */
function toVnd(raw: unknown): bigint | null {
  if (typeof raw === 'string') return /^\d+$/.test(raw) ? BigInt(raw) : null;
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? BigInt(raw) : null;
  return null;
}

/** Lowest configured base price across a listing's booking modes (VND đồng digit string). */
function priceFromModeConfig(modeConfig: unknown): string | null {
  if (!modeConfig || typeof modeConfig !== 'object') return null;
  const prices: bigint[] = [];
  for (const cfg of Object.values(modeConfig as Record<string, unknown>)) {
    if (cfg && typeof cfg === 'object') {
      const c = cfg as Record<string, unknown>;
      for (const key of ['basePrice', 'basePricePerNight']) {
        const price = toVnd(c[key]);
        if (price !== null && price > 0n) prices.push(price);
      }
    }
  }
  if (prices.length === 0) return null;
  return prices.reduce((a, b) => (b < a ? b : a)).toString();
}

function toStrings(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function targetWhere(target: FavoriteTarget): Prisma.FavoriteWhereInput {
  return target.target === 'listing' ? { listingId: target.targetId } : { groupId: target.targetId };
}

const CARD_INCLUDE = Prisma.validator<Prisma.FavoriteInclude>()({
  listing: {
    select: {
      id: true,
      title: true,
      slug: true,
      photos: true,
      attributes: true,
      modeConfig: true,
      ratingAvg: true,
      reviewCount: true,
      provinceCode: true,
      provinceName: true,
      wardCode: true,
      wardName: true,
      address: true,
      listingType: { select: { slug: true } },
    },
  },
  group: {
    select: {
      id: true,
      title: true,
      slug: true,
      photos: true,
      ratingAvg: true,
      reviewCount: true,
      provinceCode: true,
      provinceName: true,
      wardCode: true,
      wardName: true,
      address: true,
      listingType: { select: { slug: true, itemLabel: true } },
      listings: { where: { status: 'published' }, select: { modeConfig: true } },
    },
  },
});

type CardRow = Prisma.FavoriteGetPayload<{ include: typeof CARD_INCLUDE }>;

function toCard(row: CardRow): FavoriteCardRecord | null {
  if (row.listing) {
    const l = row.listing;
    return {
      id: l.id,
      kind: 'listing',
      title: l.title,
      slug: l.slug,
      listingTypeSlug: l.listingType.slug,
      attributes: (l.attributes ?? {}) as Record<string, unknown>,
      photos: toStrings(l.photos),
      priceFrom: priceFromModeConfig(l.modeConfig),
      itemLabel: null,
      ratingAvg: l.ratingAvg === null ? null : l.ratingAvg.toNumber(),
      reviewCount: l.reviewCount,
      provinceCode: l.provinceCode,
      provinceName: l.provinceName,
      wardCode: l.wardCode,
      wardName: l.wardName,
      address: l.address,
    };
  }
  if (row.group) {
    const g = row.group;
    const groupPrices = g.listings
      .map((child) => priceFromModeConfig(child.modeConfig))
      .filter((p): p is string => p !== null)
      .map((p) => BigInt(p));
    const priceFrom =
      groupPrices.length > 0 ? groupPrices.reduce((a, b) => (b < a ? b : a)).toString() : null;
    return {
      id: g.id,
      kind: 'group',
      title: g.title,
      slug: g.slug,
      listingTypeSlug: g.listingType.slug,
      attributes: {},
      photos: toStrings(g.photos),
      priceFrom,
      itemLabel: g.listingType.itemLabel,
      ratingAvg: g.ratingAvg === null ? null : g.ratingAvg.toNumber(),
      reviewCount: g.reviewCount,
      provinceCode: g.provinceCode,
      provinceName: g.provinceName,
      wardCode: g.wardCode,
      wardName: g.wardName,
      address: g.address,
    };
  }
  return null;
}

@Injectable()
export class PrismaFavoriteRepository implements IFavoriteRepository, IFavoriteReader {
  async findFavoritableTarget(
    tx: PrismaTx,
    target: FavoriteTarget,
  ): Promise<FavoritableTarget | null> {
    // Only published targets can be favorited — matches what the storefront
    // surfaces, and blocks crafting a heart on a same-tenant draft/archived item.
    if (target.target === 'listing') {
      const listing = await tx.listing.findFirst({
        where: { id: target.targetId, status: 'published' },
        select: { partnerId: true },
      });
      return listing ? { target: 'listing', targetId: target.targetId, partnerId: listing.partnerId } : null;
    }
    const group = await tx.listingGroup.findFirst({
      where: { id: target.targetId, status: 'published' },
      select: { partnerId: true },
    });
    return group ? { target: 'group', targetId: target.targetId, partnerId: group.partnerId } : null;
  }

  async add(tx: PrismaTx, favorite: NewFavorite): Promise<void> {
    try {
      await tx.favorite.create({
        data: {
          tenantId: favorite.tenantId,
          customerId: favorite.customerId,
          partnerId: favorite.partnerId,
          listingId: favorite.listingId,
          groupId: favorite.groupId,
        },
      });
    } catch (error) {
      // A second heart on the same target is a no-op, not an error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }

  async remove(tx: PrismaTx, customerId: string, target: FavoriteTarget): Promise<void> {
    await tx.favorite.deleteMany({ where: { customerId, ...targetWhere(target) } });
  }

  async listRefs(
    tx: PrismaTx,
    customerId: string,
  ): Promise<{ listingIds: string[]; groupIds: string[] }> {
    const rows = await tx.favorite.findMany({
      where: { customerId },
      select: { listingId: true, groupId: true },
    });
    return {
      listingIds: rows.map((r) => r.listingId).filter((id): id is string => id !== null),
      groupIds: rows.map((r) => r.groupId).filter((id): id is string => id !== null),
    };
  }

  async listCustomer(
    tx: PrismaTx,
    customerId: string,
    query: { page: number; pageSize: number },
  ): Promise<CustomerFavoritePage> {
    const [rows, total] = await Promise.all([
      tx.favorite.findMany({
        where: { customerId },
        include: CARD_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      tx.favorite.count({ where: { customerId } }),
    ]);
    return {
      items: rows.map(toCard).filter((card): card is FavoriteCardRecord => card !== null),
      total,
    };
  }

  async listDashboard(
    tx: PrismaTx,
    query: PartnerFavoritesQuery | TenantFavoritesQuery,
    partnerId?: string,
  ): Promise<FavoriteListPage> {
    const scopedPartnerId = partnerId ?? ('partnerId' in query ? query.partnerId : undefined);
    const baseWhere: Prisma.FavoriteWhereInput = {
      ...(scopedPartnerId ? { partnerId: scopedPartnerId } : {}),
      ...(query.listingId ? { listingId: query.listingId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { customer: { fullName: { contains: query.q, mode: 'insensitive' } } },
              { listing: { title: { contains: query.q, mode: 'insensitive' } } },
              { group: { title: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const targetWhereFilter: Prisma.FavoriteWhereInput =
      query.target === 'listing'
        ? { listingId: { not: null } }
        : query.target === 'group'
          ? { groupId: { not: null } }
          : {};
    const where: Prisma.FavoriteWhereInput = { AND: [baseWhere, targetWhereFilter] };

    const [rows, total, countAll, countListing, countGroup] = await Promise.all([
      tx.favorite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          customer: { select: { fullName: true } },
          listing: { select: { title: true, slug: true } },
          group: { select: { title: true, slug: true } },
        },
      }),
      tx.favorite.count({ where }),
      tx.favorite.count({ where: baseWhere }),
      tx.favorite.count({ where: { AND: [baseWhere, { listingId: { not: null } }] } }),
      tx.favorite.count({ where: { AND: [baseWhere, { groupId: { not: null } }] } }),
    ]);

    const items: FavoriteEntryRecord[] = rows.map((row) => {
      const isListing = row.listing !== null;
      return {
        id: row.id,
        customerName: row.customer.fullName,
        target: isListing ? 'listing' : 'group',
        targetId: isListing ? (row.listingId as string) : (row.groupId as string),
        targetTitle: (isListing ? row.listing?.title : row.group?.title) ?? '',
        targetSlug: (isListing ? row.listing?.slug : row.group?.slug) ?? '',
        createdAt: row.createdAt,
      };
    });

    return {
      items,
      total,
      counts: { all: countAll, listing: countListing, group: countGroup },
    };
  }

  async summary(tx: PrismaTx, partnerId?: string): Promise<FavoriteSummaryRecord> {
    const where: Prisma.FavoriteWhereInput = partnerId ? { partnerId } : {};
    const [total, distinctCustomers, byListing, byGroup] = await Promise.all([
      tx.favorite.count({ where }),
      tx.favorite.findMany({ where, select: { customerId: true }, distinct: ['customerId'] }),
      tx.favorite.groupBy({
        by: ['listingId'],
        where: { AND: [where, { listingId: { not: null } }] },
        _count: { _all: true },
      }),
      tx.favorite.groupBy({
        by: ['groupId'],
        where: { AND: [where, { groupId: { not: null } }] },
        _count: { _all: true },
      }),
    ]);

    const listingIds = byListing.map((r) => r.listingId).filter((id): id is string => id !== null);
    const groupIds = byGroup.map((r) => r.groupId).filter((id): id is string => id !== null);
    const [listings, groups] = await Promise.all([
      listingIds.length
        ? tx.listing.findMany({
            where: { id: { in: listingIds } },
            select: { id: true, title: true, slug: true },
          })
        : Promise.resolve([]),
      groupIds.length
        ? tx.listingGroup.findMany({
            where: { id: { in: groupIds } },
            select: { id: true, title: true, slug: true },
          })
        : Promise.resolve([]),
    ]);
    const listingById = new Map(listings.map((l) => [l.id, l]));
    const groupById = new Map(groups.map((g) => [g.id, g]));

    const topTargets: FavoriteSummaryTargetRecord[] = [
      ...byListing.flatMap((r) => {
        const meta = r.listingId ? listingById.get(r.listingId) : undefined;
        return meta
          ? [
              {
                target: 'listing' as const,
                targetId: meta.id,
                title: meta.title,
                slug: meta.slug,
                count: r._count._all,
              },
            ]
          : [];
      }),
      ...byGroup.flatMap((r) => {
        const meta = r.groupId ? groupById.get(r.groupId) : undefined;
        return meta
          ? [
              {
                target: 'group' as const,
                targetId: meta.id,
                title: meta.title,
                slug: meta.slug,
                count: r._count._all,
              },
            ]
          : [];
      }),
    ]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return { total, uniqueCustomers: distinctCustomers.length, topTargets };
  }
}
