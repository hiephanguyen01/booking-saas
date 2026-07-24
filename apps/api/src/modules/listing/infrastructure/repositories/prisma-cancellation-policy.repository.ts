import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CancellationTier } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CancellationPolicyRecord,
  ICancellationPolicyRepository,
} from '../../domain/ports/cancellation-policy-repository.port';
import type {
  CancellationPolicyPatch,
  NewCancellationPolicy,
} from '../../domain/entities/cancellation-policy.entity';

type Row = {
  id: string;
  tenantId: string;
  partnerId: string | null;
  name: string;
  rules: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(p: Row): CancellationPolicyRecord {
  return {
    id: p.id,
    tenantId: p.tenantId,
    partnerId: p.partnerId,
    name: p.name,
    rules: (p.rules ?? []) as unknown as CancellationTier[],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

@Injectable()
export class PrismaCancellationPolicyRepository implements ICancellationPolicyRepository {
  async listForPartner(tx: PrismaTx, partnerId: string): Promise<CancellationPolicyRecord[]> {
    const rows = await tx.cancellationPolicy.findMany({
      where: { OR: [{ partnerId: null }, { partnerId }] },
      orderBy: { name: 'asc' },
    });
    return rows.map(toRecord);
  }

  async listTenantLevel(tx: PrismaTx): Promise<CancellationPolicyRecord[]> {
    const rows = await tx.cancellationPolicy.findMany({
      where: { partnerId: null },
      orderBy: { name: 'asc' },
    });
    return rows.map(toRecord);
  }

  async findById(tx: PrismaTx, id: string): Promise<CancellationPolicyRecord | null> {
    const row = await tx.cancellationPolicy.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async create(
    tx: PrismaTx,
    tenantId: string,
    data: NewCancellationPolicy,
  ): Promise<CancellationPolicyRecord> {
    const row = await tx.cancellationPolicy.create({
      data: {
        tenantId,
        partnerId: data.partnerId,
        name: data.name,
        rules: data.rules as unknown as Prisma.InputJsonValue,
      },
    });
    return toRecord(row);
  }

  async update(
    tx: PrismaTx,
    id: string,
    patch: CancellationPolicyPatch,
  ): Promise<CancellationPolicyRecord> {
    const row = await tx.cancellationPolicy.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.rules !== undefined
          ? { rules: patch.rules as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    return toRecord(row);
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.cancellationPolicy.delete({ where: { id } });
  }

  countListingsUsing(tx: PrismaTx, id: string): Promise<number> {
    return tx.listing.count({ where: { cancellationPolicyId: id } });
  }

  async findPartnerDefaultId(tx: PrismaTx, partnerId: string): Promise<string | null> {
    const partner = await tx.partner.findUnique({
      where: { id: partnerId },
      select: { defaultCancellationPolicyId: true },
    });
    return partner?.defaultCancellationPolicyId ?? null;
  }

  async findTenantDefaultId(tx: PrismaTx, tenantId: string): Promise<string | null> {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultCancellationPolicyId: true },
    });
    return tenant?.defaultCancellationPolicyId ?? null;
  }
}
