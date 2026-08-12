import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { pageOffset, toStatusCounts, type RepoPageWithCounts } from '../../../../shared/pagination/pagination';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AffiliateCustomRateIntent,
  AffiliatePayoutInfoIntent,
  AffiliateState,
  AffiliateStatusIntent,
  NewAffiliate,
} from '../../domain/entities/affiliate.entity';
import type {
  AffiliateRecord,
  AffiliateWithUser,
  IAffiliateReader,
  ListAffiliatesFilter,
} from '../../domain/ports/affiliate-reader.port';
import type { IAffiliateRepository } from '../../domain/ports/affiliate-repository.port';

type Row = Prisma.AffiliateGetPayload<Record<string, never>>;
type RowWithRelations = Prisma.AffiliateGetPayload<{ include: typeof WITH_RELATIONS }>;

const WITH_RELATIONS = {
  user: { select: { fullName: true, email: true, phone: true } },
  tenant: {
    select: {
      name: true,
      // The tenant's primary domain IS the storefront origin a referral link must
      // point at (§6.1). Joined here so a membership carries its own link origin
      // and no caller has to invent one from a platform-wide env var.
      // Storefront only: this hostname builds affiliate referral links, which
      // must land a visitor on the shop, never on the admin console.
      domains: { where: { isPrimary: true, kind: 'storefront' }, select: { hostname: true }, take: 1 },
    },
  },
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
    userPhone: a.user.phone,
    tenantName: a.tenant.name,
    tenantHostname: a.tenant.domains[0]?.hostname ?? null,
  };
}

@Injectable()
export class PrismaAffiliateRepository
  implements IAffiliateRepository, IAffiliateReader
{
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tx: PrismaTx,
    affiliate: NewAffiliate,
  ): Promise<AffiliateRecord> {
    return toRecord(
      await tx.affiliate.create({
        data: {
          tenantId: affiliate.tenantId,
          userId: affiliate.userId,
          status: affiliate.status,
          customRate: affiliate.customRate,
          payoutInfo: (affiliate.payoutInfo ?? {}) as Prisma.InputJsonValue,
        },
      }),
    );
  }

  async loadById(
    tx: PrismaTx,
    id: string,
  ): Promise<AffiliateState | null> {
    const a = await tx.affiliate.findUnique({ where: { id } });
    return a ? toRecord(a) : null;
  }

  async loadByUser(
    tx: PrismaTx,
    userId: string,
  ): Promise<AffiliateState | null> {
    // `(tenant_id, user_id)` is unique; RLS scopes the lookup to the current tenant.
    const a = await tx.affiliate.findFirst({ where: { userId } });
    return a ? toRecord(a) : null;
  }

  async findByUserWithTenant(tx: PrismaTx, id: string): Promise<AffiliateWithUser | null> {
    const a = await tx.affiliate.findUnique({ where: { id }, include: WITH_RELATIONS });
    return a ? toWithUser(a) : null;
  }

  async list(
    tx: PrismaTx,
    filter: ListAffiliatesFilter,
  ): Promise<RepoPageWithCounts<AffiliateWithUser>> {
    // `counts` are computed over every membership (the tenant scope RLS already
    // applies), NOT the active `status` filter — so each filter-tab chip shows its
    // own total. The page itself is narrowed by `where`.
    const baseWhere: Prisma.AffiliateWhereInput = {};
    const where: Prisma.AffiliateWhereInput = filter.status ? { status: filter.status } : {};
    const { skip, take } = pageOffset(filter);
    const [rows, total, grouped] = await Promise.all([
      tx.affiliate.findMany({ where, include: WITH_RELATIONS, orderBy: { createdAt: 'desc' }, skip, take }),
      tx.affiliate.count({ where }),
      tx.affiliate.groupBy({ by: ['status'], where: baseWhere, _count: true }),
    ]);
    return { items: rows.map(toWithUser), total, counts: toStatusCounts(grouped) };
  }

  async setStatus(
    tx: PrismaTx,
    id: string,
    intent: AffiliateStatusIntent,
  ): Promise<AffiliateRecord> {
    return toRecord(
      await tx.affiliate.update({
        where: { id },
        data: { status: intent.status },
      }),
    );
  }

  async setCustomRate(
    tx: PrismaTx,
    id: string,
    intent: AffiliateCustomRateIntent,
  ): Promise<AffiliateRecord> {
    return toRecord(
      await tx.affiliate.update({
        where: { id },
        data: { customRate: intent.customRate },
      }),
    );
  }

  async replacePayoutInfo(
    tx: PrismaTx,
    id: string,
    intent: AffiliatePayoutInfoIntent,
  ): Promise<AffiliateWithUser> {
    // Whole-object replace (not a merge): the contract body is the complete payout
    // record, so an omitted field is a cleared field.
    return toWithUser(
      await tx.affiliate.update({
        where: { id },
        data: { payoutInfo: intent.payoutInfo as Prisma.InputJsonValue },
        include: WITH_RELATIONS,
      }),
    );
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
