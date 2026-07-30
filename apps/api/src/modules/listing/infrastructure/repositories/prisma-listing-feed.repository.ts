import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { pageOffset } from '../../../../shared/pagination/pagination';
import type {
  IListingFeedRepository,
  ListingFeedFilter,
  ListingFeedKey,
  ListingFeedPage,
} from '../../domain/ports/listing-feed-repository.port';

/**
 * Key-only feed query. Keeping the UNION at this layer lets the application
 * orchestration bulk-load normal listing/group records through their own ports.
 */
@Injectable()
export class PrismaListingFeedRepository implements IListingFeedRepository {
  async listPage(
    tx: PrismaTx,
    filter: ListingFeedFilter,
    page: { page: number; pageSize: number },
  ): Promise<ListingFeedPage> {
    const listingConditions: Prisma.Sql[] = [
      Prisma.sql`l.group_id IS NULL`,
      Prisma.sql`l.partner_id = ${filter.partnerId}::uuid`,
    ];
    const groupConditions: Prisma.Sql[] = [Prisma.sql`g.partner_id = ${filter.partnerId}::uuid`];

    if (filter.listingTypeId) {
      listingConditions.push(Prisma.sql`l.listing_type_id = ${filter.listingTypeId}::uuid`);
      groupConditions.push(Prisma.sql`g.listing_type_id = ${filter.listingTypeId}::uuid`);
    }
    if (filter.status) {
      listingConditions.push(Prisma.sql`l.status = ${filter.status}::publish_status`);
      groupConditions.push(Prisma.sql`g.status = ${filter.status}::publish_status`);
    }
    if (filter.q) {
      listingConditions.push(Prisma.sql`POSITION(LOWER(${filter.q}) IN LOWER(l.title)) > 0`);
      groupConditions.push(Prisma.sql`POSITION(LOWER(${filter.q}) IN LOWER(g.title)) > 0`);
    }

    const feed = Prisma.sql`
      SELECT 'single'::text AS kind, l.id, l.created_at
      FROM listings l
      WHERE ${Prisma.join(listingConditions, ' AND ')}
      UNION ALL
      SELECT 'grouped'::text AS kind, g.id, g.created_at
      FROM listing_groups g
      WHERE ${Prisma.join(groupConditions, ' AND ')}`;
    const { skip, take } = pageOffset(page);
    const [rows, counted] = await Promise.all([
      tx.$queryRaw<Array<{ kind: 'single' | 'grouped'; id: string }>>(Prisma.sql`
        SELECT kind, id
        FROM (${feed}) AS feed
        ORDER BY created_at DESC, id DESC
        LIMIT ${take} OFFSET ${skip}`),
      tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM (${feed}) AS feed`),
    ]);

    const keys: ListingFeedKey[] = rows.map((row) => ({ kind: row.kind, id: row.id }));
    return { keys, total: Number(counted[0]?.total ?? 0n) };
  }
}
