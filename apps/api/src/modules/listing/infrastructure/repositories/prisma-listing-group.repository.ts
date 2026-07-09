import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ModerationActor } from '@booking/shared';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateListingGroupData,
  IListingGroupRepository,
  ListingGroupRecord,
  UpdateListingGroupData,
} from '../../domain/ports/listing-group-repository.port';
import type { ModerationUpdate } from '../../domain/ports/listing-repository.port';

type Row = Prisma.ListingGroupGetPayload<Record<string, never>>;

function toRecord(g: Row): ListingGroupRecord {
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
    amenities: (g.amenities ?? []) as string[],
    photos: (g.photos ?? []) as string[],
    status: g.status,
    publishedBy: g.publishedBy as ModerationActor | null,
    hiddenBy: g.hiddenBy as ModerationActor | null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

@Injectable()
export class PrismaListingGroupRepository implements IListingGroupRepository {
  async create(
    tx: PrismaTx,
    tenantId: string,
    data: CreateListingGroupData,
  ): Promise<ListingGroupRecord> {
    return toRecord(
      await tx.listingGroup.create({
        data: {
          tenantId,
          partnerId: data.partnerId,
          listingTypeId: data.listingTypeId,
          title: data.title,
          slug: data.slug,
          description: data.description ?? null,
          address: data.address ?? null,
          workingArea: data.workingArea ?? null,
          amenities: data.amenities as Prisma.InputJsonValue,
          photos: data.photos as Prisma.InputJsonValue,
        },
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<ListingGroupRecord | null> {
    const g = await tx.listingGroup.findUnique({ where: { id } });
    return g ? toRecord(g) : null;
  }

  async findBySlug(tx: PrismaTx, slug: string): Promise<ListingGroupRecord | null> {
    const g = await tx.listingGroup.findFirst({ where: { slug } });
    return g ? toRecord(g) : null;
  }

  async list(tx: PrismaTx): Promise<ListingGroupRecord[]> {
    const items = await tx.listingGroup.findMany({ orderBy: { createdAt: 'desc' } });
    return items.map(toRecord);
  }

  async update(
    tx: PrismaTx,
    id: string,
    data: UpdateListingGroupData,
  ): Promise<ListingGroupRecord> {
    return toRecord(
      await tx.listingGroup.update({
        where: { id },
        data: {
          partnerId: data.partnerId,
          listingTypeId: data.listingTypeId,
          title: data.title,
          slug: data.slug,
          description: data.description,
          address: data.address,
          workingArea: data.workingArea,
          amenities: data.amenities as Prisma.InputJsonValue | undefined,
          photos: data.photos as Prisma.InputJsonValue | undefined,
        },
      }),
    );
  }

  async moderate(tx: PrismaTx, id: string, update: ModerationUpdate): Promise<ListingGroupRecord> {
    return toRecord(
      await tx.listingGroup.update({
        where: { id },
        data: { status: update.status, publishedBy: update.publishedBy, hiddenBy: update.hiddenBy },
      }),
    );
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.listingGroup.delete({ where: { id } });
  }

  countListings(tx: PrismaTx, groupId: string): Promise<number> {
    return tx.listing.count({ where: { groupId } });
  }
}
