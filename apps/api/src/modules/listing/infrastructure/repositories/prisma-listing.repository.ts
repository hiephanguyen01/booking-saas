import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { BookingMode } from '@booking/shared';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateListingData,
  IListingRepository,
  ListingRecord,
  PublicListingRecord,
  UpdateListingData,
} from '../../domain/ports/listing-repository.port';

type Row = Prisma.ListingGetPayload<Record<string, never>>;

function toRecord(l: Row): ListingRecord {
  return {
    id: l.id,
    tenantId: l.tenantId,
    partnerId: l.partnerId,
    listingTypeId: l.listingTypeId,
    resourceId: l.resourceId,
    groupId: l.groupId,
    categoryId: l.categoryId,
    title: l.title,
    slug: l.slug,
    description: l.description,
    photos: (l.photos ?? []) as string[],
    attributes: (l.attributes ?? {}) as Record<string, unknown>,
    bookingModes: l.bookingModes as BookingMode[],
    modeConfig: (l.modeConfig ?? {}) as Record<string, unknown>,
    stockQuantity: l.stockQuantity,
    capacity: l.capacity,
    bufferBefore: l.bufferBefore,
    bufferAfter: l.bufferAfter,
    approvalRequired: l.approvalRequired,
    depositPercent: l.depositPercent,
    balanceDue: l.balanceDue,
    cancellationPolicyId: l.cancellationPolicyId,
    status: l.status,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

@Injectable()
export class PrismaListingRepository implements IListingRepository {
  async create(tx: PrismaTx, tenantId: string, data: CreateListingData): Promise<ListingRecord> {
    return toRecord(
      await tx.listing.create({
        data: {
          tenantId,
          partnerId: data.partnerId,
          listingTypeId: data.listingTypeId,
          resourceId: data.resourceId,
          groupId: data.groupId ?? null,
          categoryId: data.categoryId ?? null,
          title: data.title,
          slug: data.slug,
          description: data.description ?? null,
          photos: data.photos as Prisma.InputJsonValue,
          attributes: data.attributes as Prisma.InputJsonValue,
          bookingModes: data.bookingModes as never,
          modeConfig: data.modeConfig as Prisma.InputJsonValue,
          stockQuantity: data.stockQuantity ?? null,
          capacity: data.capacity ?? null,
          bufferBefore: data.bufferBefore,
          bufferAfter: data.bufferAfter,
          approvalRequired: data.approvalRequired,
          depositPercent: data.depositPercent,
          balanceDue: data.balanceDue,
          cancellationPolicyId: data.cancellationPolicyId ?? null,
        },
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<ListingRecord | null> {
    const l = await tx.listing.findUnique({ where: { id } });
    return l ? toRecord(l) : null;
  }

  async findBySlug(tx: PrismaTx, slug: string): Promise<ListingRecord | null> {
    const l = await tx.listing.findFirst({ where: { slug } });
    return l ? toRecord(l) : null;
  }

  async findPublicBySlug(tx: PrismaTx, slug: string): Promise<PublicListingRecord | null> {
    const l = await tx.listing.findFirst({
      where: { slug, status: 'published' },
      include: { resource: { select: { timezone: true } }, listingType: { select: { slug: true } } },
    });
    if (!l) return null;
    return { ...toRecord(l), resourceTimezone: l.resource.timezone, listingTypeSlug: l.listingType.slug };
  }

  async list(tx: PrismaTx, filter: { groupId?: string }): Promise<ListingRecord[]> {
    const items = await tx.listing.findMany({
      where: filter.groupId ? { groupId: filter.groupId } : {},
      orderBy: { createdAt: 'desc' },
    });
    return items.map(toRecord);
  }

  async update(tx: PrismaTx, id: string, data: UpdateListingData): Promise<ListingRecord> {
    return toRecord(
      await tx.listing.update({
        where: { id },
        data: {
          groupId: data.groupId,
          categoryId: data.categoryId,
          title: data.title,
          slug: data.slug,
          description: data.description,
          photos: data.photos as Prisma.InputJsonValue | undefined,
          attributes: data.attributes as Prisma.InputJsonValue | undefined,
          bookingModes: data.bookingModes as never,
          modeConfig: data.modeConfig as Prisma.InputJsonValue | undefined,
          stockQuantity: data.stockQuantity,
          capacity: data.capacity,
          bufferBefore: data.bufferBefore,
          bufferAfter: data.bufferAfter,
          approvalRequired: data.approvalRequired,
          depositPercent: data.depositPercent,
          balanceDue: data.balanceDue,
          cancellationPolicyId: data.cancellationPolicyId,
        },
      }),
    );
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.listing.delete({ where: { id } });
  }

  countBookings(tx: PrismaTx, listingId: string): Promise<number> {
    return tx.booking.count({ where: { listingId } });
  }
}
