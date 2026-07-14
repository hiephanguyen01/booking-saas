import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AttributeField, BookingMode } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateListingTypeData,
  IListingTypeRepository,
  ListingTypeRecord,
  UpdateListingTypeData,
} from '../../domain/ports/listing-type-repository.port';

type PrismaListingType = Prisma.ListingTypeGetPayload<Record<string, never>>;

function toRecord(t: PrismaListingType): ListingTypeRecord {
  return {
    id: t.id,
    tenantId: t.tenantId,
    name: t.name,
    slug: t.slug,
    icon: t.icon,
    allowedModes: t.allowedModes as BookingMode[],
    defaultModes: t.defaultModes as BookingMode[],
    attributeSchema: (t.attributeSchema ?? []) as unknown as AttributeField[],
    unitLabel: t.unitLabel,
    sortOrder: t.sortOrder,
    isActive: t.isActive,
    requiresIdentityVerification: t.requiresIdentityVerification,
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
    data: CreateListingTypeData,
  ): Promise<ListingTypeRecord> {
    return toRecord(
      await tx.listingType.create({
        data: {
          tenantId,
          name: data.name,
          slug: data.slug,
          icon: data.icon,
          allowedModes: data.allowedModes as never,
          defaultModes: data.defaultModes as never,
          attributeSchema: data.attributeSchema as unknown as Prisma.InputJsonValue,
          unitLabel: data.unitLabel,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
          requiresIdentityVerification: data.requiresIdentityVerification,
        },
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<ListingTypeRecord | null> {
    const t = await tx.listingType.findUnique({ where: { id } });
    return t ? toRecord(t) : null;
  }

  async findBySlug(tx: PrismaTx, slug: string): Promise<ListingTypeRecord | null> {
    const t = await tx.listingType.findFirst({ where: { slug } });
    return t ? toRecord(t) : null;
  }

  async list(tx: PrismaTx, opts: { includeInactive: boolean }): Promise<ListingTypeRecord[]> {
    const items = await tx.listingType.findMany({
      where: opts.includeInactive ? {} : { isActive: true },
      orderBy,
    });
    return items.map(toRecord);
  }

  async listActive(tx: PrismaTx): Promise<ListingTypeRecord[]> {
    const items = await tx.listingType.findMany({ where: { isActive: true }, orderBy });
    return items.map(toRecord);
  }

  async update(
    tx: PrismaTx,
    id: string,
    data: UpdateListingTypeData,
  ): Promise<ListingTypeRecord> {
    return toRecord(
      await tx.listingType.update({
        where: { id },
        data: {
          name: data.name,
          slug: data.slug,
          icon: data.icon,
          allowedModes: data.allowedModes as never,
          defaultModes: data.defaultModes as never,
          attributeSchema:
            data.attributeSchema === undefined
              ? undefined
              : (data.attributeSchema as unknown as Prisma.InputJsonValue),
          unitLabel: data.unitLabel,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
          requiresIdentityVerification: data.requiresIdentityVerification,
        },
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
