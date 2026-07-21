import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  IPublicPartnerRepository,
  PublicPartnerRecord,
} from '../../domain/ports/public-partner-repository.port';

function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

@Injectable()
export class PrismaPublicPartnerRepository implements IPublicPartnerRepository {
  async findProfile(tx: PrismaTx, slug: string): Promise<PublicPartnerRecord | null> {
    const partner = await tx.partner.findFirst({
      where: {
        slug,
        status: 'approved',
        OR: [
          { listings: { some: { status: 'published', groupId: null } } },
          {
            listingGroups: {
              some: { status: 'published', listings: { some: { status: 'published' } } },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        businessInfo: true,
        partnerType: true,
        verifiedAt: true,
        createdAt: true,
      },
    });
    if (!partner) return null;

    const [standaloneByType, groupsByType, completedBookings, reviewAggregate] = await Promise.all([
      tx.listing.groupBy({
        by: ['listingTypeId'],
        where: { partnerId: partner.id, status: 'published', groupId: null },
        _count: true,
      }),
      tx.listingGroup.groupBy({
        by: ['listingTypeId'],
        where: {
          partnerId: partner.id,
          status: 'published',
          listings: { some: { status: 'published' } },
        },
        _count: true,
      }),
      tx.booking.count({ where: { partnerId: partner.id, status: 'completed' } }),
      tx.review.aggregate({
        where: { partnerId: partner.id },
        _avg: { rating: true },
        _count: true,
      }),
    ]);
    const counts = new Map<string, number>();
    for (const row of [...standaloneByType, ...groupsByType]) {
      counts.set(row.listingTypeId, (counts.get(row.listingTypeId) ?? 0) + row._count);
    }
    const types = counts.size
      ? await tx.listingType.findMany({
          where: { id: { in: [...counts.keys()] }, isActive: true },
          select: { id: true, name: true, slug: true, icon: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        })
      : [];
    const businessInfo = partner.businessInfo as Record<string, unknown>;
    return {
      id: partner.id,
      name: partner.name,
      slug: partner.slug,
      description: partner.description,
      logoUrl: publicUrl(businessInfo['logoUrl']),
      partnerType: partner.partnerType,
      verifiedAt: partner.verifiedAt,
      createdAt: partner.createdAt,
      publishedOfferings: [...counts.values()].reduce((sum, count) => sum + count, 0),
      completedBookings,
      ratingAvg: reviewAggregate._avg.rating,
      reviewCount: reviewAggregate._count,
      listingTypes: types.map((type) => ({ ...type, publishedCount: counts.get(type.id) ?? 0 })),
    };
  }
}
