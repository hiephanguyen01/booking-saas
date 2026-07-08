import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  IListingReadRepository,
  PublicListingFilter,
  PublicListingRecord,
} from '../../domain/ports/listing-read-repository.port';

/**
 * Read-only storefront listing queries (published only). Dynamic `attr.<key>`
 * filters map to Prisma JSON-path equality on the `attributes` jsonb column.
 * Listing writes are Task 1.4.
 */
@Injectable()
export class PrismaListingReadRepository implements IListingReadRepository {
  async findPublished(tx: PrismaTx, filter: PublicListingFilter): Promise<PublicListingRecord[]> {
    const attrConditions: Prisma.ListingWhereInput[] = Object.entries(filter.attrFilters).map(
      ([key, value]) => ({ attributes: { path: [key], equals: value } }),
    );

    const where: Prisma.ListingWhereInput = {
      status: 'published',
      ...(filter.typeSlug ? { listingType: { slug: filter.typeSlug } } : {}),
      ...(filter.category ? { category: { slug: filter.category } } : {}),
      ...(filter.q ? { title: { contains: filter.q, mode: 'insensitive' } } : {}),
      ...(attrConditions.length > 0 ? { AND: attrConditions } : {}),
    };

    const items = await tx.listing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { listingType: { select: { slug: true } } },
      take: 100,
    });

    return items.map((l) => ({
      id: l.id,
      title: l.title,
      slug: l.slug,
      listingTypeSlug: l.listingType.slug,
      attributes: (l.attributes ?? {}) as Record<string, unknown>,
      photos: (l.photos ?? []) as unknown[],
      modeConfig: (l.modeConfig ?? {}) as Record<string, unknown>,
    }));
  }
}
