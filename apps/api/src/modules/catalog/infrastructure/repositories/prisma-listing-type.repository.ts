import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  listingTypeSearchConfigSchema,
  type AttributeField,
  type BookingMode,
  type BookingSelection,
  type ListingStructure,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { ListingTypePatch, NewListingType } from '../../domain/entities/listing-type.entity';
import type {
  IListingTypeRepository,
  ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';

/**
 * `listingCount` on every read: it drives the "N listings" column and lets the UI
 * say up-front that a type in use cannot be deleted, instead of surfacing that as
 * a failed request. A `_count` is a cheap grouped subquery on the indexed
 * `listings.listing_type_id`.
 */
const LISTING_TYPE_INCLUDE = {
  _count: { select: { listings: true } },
} as const satisfies Prisma.ListingTypeInclude;

type PrismaListingType = Prisma.ListingTypeGetPayload<{ include: typeof LISTING_TYPE_INCLUDE }>;

function toRecord(t: PrismaListingType): ListingTypeRecord {
  return {
    id: t.id,
    tenantId: t.tenantId,
    name: t.name,
    slug: t.slug,
    icon: t.icon,
    iconImageUrl: t.iconImageUrl,
    allowedModes: t.allowedModes as BookingMode[],
    defaultModes: t.defaultModes as BookingMode[],
    bookingSelection: t.bookingSelection as BookingSelection,
    attributeSchema: (t.attributeSchema ?? []) as unknown as AttributeField[],
    searchConfig: listingTypeSearchConfigSchema.parse(t.searchConfig ?? {}),
    unitLabel: t.unitLabel,
    sortOrder: t.sortOrder,
    isActive: t.isActive,
    requiresIdentityVerification: t.requiresIdentityVerification,
    structure: t.structure as ListingStructure,
    itemLabel: t.itemLabel,
    listingCount: t._count.listings,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

const orderBy: Prisma.ListingTypeOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { name: 'asc' },
];

/** Tenant-scoped (RLS): tx methods run inside `forTenant`. */
@Injectable()
export class PrismaListingTypeRepository implements IListingTypeRepository {
  async create(
    tx: PrismaTx,
    tenantId: string,
    data: NewListingType,
  ): Promise<ListingTypeRecord> {
    return toRecord(
      await tx.listingType.create({
        data: {
          tenantId,
          name: data.name,
          slug: data.slug,
          icon: data.icon,
          iconImageUrl: data.iconImageUrl,
          allowedModes: data.allowedModes as never,
          defaultModes: data.defaultModes as never,
          bookingSelection: data.bookingSelection,
          attributeSchema: data.attributeSchema as unknown as Prisma.InputJsonValue,
          searchConfig: data.searchConfig as unknown as Prisma.InputJsonValue,
          unitLabel: data.unitLabel,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
          requiresIdentityVerification: data.requiresIdentityVerification,
          structure: data.structure,
          itemLabel: data.itemLabel,
        },
        include: LISTING_TYPE_INCLUDE,
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<ListingTypeRecord | null> {
    const t = await tx.listingType.findUnique({ where: { id }, include: LISTING_TYPE_INCLUDE });
    return t ? toRecord(t) : null;
  }

  async findBySlug(tx: PrismaTx, slug: string): Promise<ListingTypeRecord | null> {
    const t = await tx.listingType.findFirst({ where: { slug }, include: LISTING_TYPE_INCLUDE });
    return t ? toRecord(t) : null;
  }

  async list(
    tx: PrismaTx,
    opts: { includeInactive: boolean; q?: string },
  ): Promise<ListingTypeRecord[]> {
    const where: Prisma.ListingTypeWhereInput = {
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.q ? { name: { contains: opts.q, mode: 'insensitive' } } : {}),
    };
    const items = await tx.listingType.findMany({
      where,
      orderBy,
      include: LISTING_TYPE_INCLUDE,
    });
    return items.map(toRecord);
  }

  async listActive(tx: PrismaTx): Promise<ListingTypeRecord[]> {
    const items = await tx.listingType.findMany({
      where: { isActive: true },
      orderBy,
      include: LISTING_TYPE_INCLUDE,
    });
    return items.map(toRecord);
  }

  async update(
    tx: PrismaTx,
    id: string,
    data: ListingTypePatch,
  ): Promise<ListingTypeRecord> {
    return toRecord(
      await tx.listingType.update({
        where: { id },
        data: {
          name: data.name,
          slug: data.slug,
          icon: data.icon,
          iconImageUrl: data.iconImageUrl,
          allowedModes: data.allowedModes as never,
          defaultModes: data.defaultModes as never,
          bookingSelection: data.bookingSelection,
          attributeSchema:
            data.attributeSchema === undefined
              ? undefined
              : (data.attributeSchema as unknown as Prisma.InputJsonValue),
          searchConfig:
            data.searchConfig === undefined
              ? undefined
              : (data.searchConfig as unknown as Prisma.InputJsonValue),
          unitLabel: data.unitLabel,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
          requiresIdentityVerification: data.requiresIdentityVerification,
          structure: data.structure,
          itemLabel: data.itemLabel,
        },
        include: LISTING_TYPE_INCLUDE,
      }),
    );
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.listingType.delete({ where: { id } });
  }

  countListingsOfType(tx: PrismaTx, listingTypeId: string): Promise<number> {
    return tx.listing.count({ where: { listingTypeId } });
  }
}
