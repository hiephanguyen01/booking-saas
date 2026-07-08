import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateResourceData,
  IResourceRepository,
  ResourceRecord,
} from '../../domain/ports/resource-repository.port';

type Row = Prisma.ResourceGetPayload<Record<string, never>>;

function toRecord(r: Row): ResourceRecord {
  return {
    id: r.id,
    tenantId: r.tenantId,
    partnerId: r.partnerId,
    name: r.name,
    timezone: r.timezone,
    createdAt: r.createdAt,
  };
}

@Injectable()
export class PrismaResourceRepository implements IResourceRepository {
  async create(tx: PrismaTx, tenantId: string, data: CreateResourceData): Promise<ResourceRecord> {
    return toRecord(
      await tx.resource.create({
        data: { tenantId, partnerId: data.partnerId, name: data.name, timezone: data.timezone },
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<ResourceRecord | null> {
    const r = await tx.resource.findUnique({ where: { id } });
    return r ? toRecord(r) : null;
  }

  async list(tx: PrismaTx): Promise<ResourceRecord[]> {
    const items = await tx.resource.findMany({ orderBy: { createdAt: 'desc' } });
    return items.map(toRecord);
  }
}
