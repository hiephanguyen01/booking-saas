import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AffiliateRecord,
  AffiliateStatus,
  AffiliateWithUser,
  CreateAffiliateData,
  IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';

type Row = Prisma.AffiliateGetPayload<Record<string, never>>;
type RowWithRelations = Prisma.AffiliateGetPayload<{
  include: { user: { select: { fullName: true; email: true } }; tenant: { select: { name: true } } };
}>;

const WITH_RELATIONS = {
  user: { select: { fullName: true, email: true } },
  tenant: { select: { name: true } },
} as const;

function toRecord(a: Row): AffiliateRecord {
  return {
    id: a.id,
    tenantId: a.tenantId,
    userId: a.userId,
    status: a.status,
    customRate: a.customRate,
    payoutInfo: a.payoutInfo,
    createdAt: a.createdAt,
  };
}

function toWithUser(a: RowWithRelations): AffiliateWithUser {
  return {
    ...toRecord(a),
    userName: a.user.fullName,
    userEmail: a.user.email,
    tenantName: a.tenant.name,
  };
}

@Injectable()
export class PrismaAffiliateRepository implements IAffiliateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: PrismaTx, tenantId: string, data: CreateAffiliateData): Promise<AffiliateRecord> {
    return toRecord(
      await tx.affiliate.create({
        data: {
          tenantId,
          userId: data.userId,
          status: 'pending',
          payoutInfo: (data.payoutInfo ?? {}) as Prisma.InputJsonValue,
        },
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<AffiliateRecord | null> {
    const a = await tx.affiliate.findUnique({ where: { id } });
    return a ? toRecord(a) : null;
  }

  async findByUser(tx: PrismaTx, userId: string): Promise<AffiliateRecord | null> {
    // `(tenant_id, user_id)` is unique; RLS scopes the lookup to the current tenant.
    const a = await tx.affiliate.findFirst({ where: { userId } });
    return a ? toRecord(a) : null;
  }

  async findByUserWithTenant(tx: PrismaTx, id: string): Promise<AffiliateWithUser | null> {
    const a = await tx.affiliate.findUnique({ where: { id }, include: WITH_RELATIONS });
    return a ? toWithUser(a) : null;
  }

  async list(tx: PrismaTx): Promise<AffiliateWithUser[]> {
    const rows = await tx.affiliate.findMany({ include: WITH_RELATIONS, orderBy: { createdAt: 'desc' } });
    return rows.map(toWithUser);
  }

  async setStatus(tx: PrismaTx, id: string, status: AffiliateStatus): Promise<AffiliateRecord> {
    return toRecord(await tx.affiliate.update({ where: { id }, data: { status } }));
  }

  async setCustomRate(tx: PrismaTx, id: string, customRate: bigint | null): Promise<AffiliateRecord> {
    return toRecord(await tx.affiliate.update({ where: { id }, data: { customRate } }));
  }

  async adminFindMembershipsByUser(userId: string): Promise<AffiliateWithUser[]> {
    // BYPASSRLS admin pool, strictly filtered to this user — the ONE cross-tenant
    // read the portal needs before any tenant context exists (§6.4).
    const rows = await this.prisma.admin.affiliate.findMany({
      where: { userId },
      include: WITH_RELATIONS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toWithUser);
  }
}
