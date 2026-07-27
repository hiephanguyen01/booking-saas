import { Injectable } from '@nestjs/common';
import type { Partner as PrismaPartnerRow, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { toStatusCounts, type RepoPageWithCounts, pageOffset } from '../../../../shared/pagination/pagination';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  PartnerBusinessInfoIntent,
  PartnerDefaultCancellationPolicyIntent,
  PartnerIdentityRejectionIntent,
  PartnerIdentitySubmissionIntent,
  PartnerIdentityVerifiedIntent,
  NewPartner,
  PartnerPayoutIntent,
  PartnerState,
  PartnerStatusIntent,
} from '../../domain/entities/partner.entity';
import type {
  IPartnerReader,
  ListPartnersFilter,
  PartnerRecord,
} from '../../domain/ports/partner-reader.port';
import type { IPartnerRepository } from '../../domain/ports/partner-repository.port';

/**
 * The owning user is the EARLIEST `PartnerMember` — `applyAsPartner` creates the
 * applicant's membership together with the partner row and grants it the Partner
 * Owner role, so "first member" is the owner. `users` carries no tenant_id and
 * therefore no RLS policy, but `partner_members` does: the join only ever reaches
 * a user who is a member under the current `app.tenant_id`.
 */
const partnerInclude = {
  members: {
    orderBy: { createdAt: 'asc' },
    take: 1,
    select: { user: { select: { email: true, phone: true } } },
  },
} satisfies Prisma.PartnerInclude;

type PrismaPartner = Prisma.PartnerGetPayload<{ include: typeof partnerInclude }>;

function toRecord(p: PrismaPartner): PartnerRecord {
  const owner = p.members[0]?.user ?? null;
  return {
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    slug: p.slug,
    description: p.description,
    partnerType: p.partnerType,
    isHouse: p.isHouse,
    status: p.status,
    verificationStatus: p.verificationStatus,
    verifiedAt: p.verifiedAt,
    dateOfBirth: p.dateOfBirth,
    payoutInfo: (p.payoutInfo ?? {}) as Record<string, unknown>,
    businessInfo: (p.businessInfo ?? {}) as Record<string, unknown>,
    contactInfo: (p.contactInfo ?? {}) as Record<string, unknown>,
    identityInfo: (p.identityInfo ?? {}) as Record<string, unknown>,
    defaultCancellationPolicyId: p.defaultCancellationPolicyId,
    owner: owner ? { email: owner.email, phone: owner.phone } : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toState(p: PrismaPartnerRow): PartnerState {
  return {
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    slug: p.slug,
    description: p.description,
    partnerType: p.partnerType,
    isHouse: p.isHouse,
    status: p.status,
    verificationStatus: p.verificationStatus,
    verifiedAt: p.verifiedAt,
    dateOfBirth: p.dateOfBirth,
    payoutInfo: (p.payoutInfo ?? {}) as Record<string, unknown>,
    businessInfo: (p.businessInfo ?? {}) as Record<string, unknown>,
    contactInfo: (p.contactInfo ?? {}) as Record<string, unknown>,
    identityInfo: (p.identityInfo ?? {}) as Record<string, unknown>,
    defaultCancellationPolicyId: p.defaultCancellationPolicyId,
  };
}

/**
 * Partner data is tenant-scoped (RLS): tx methods run inside `forTenant`, so the
 * `app.tenant_id` GUC filters rows and satisfies the tenant_isolation WITH CHECK
 * on insert. Only `tenantIdOfPartner` runs on the admin pool (no tenant context).
 */
@Injectable()
export class PrismaPartnerRepository implements IPartnerRepository, IPartnerReader {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: PrismaTx, partner: NewPartner): Promise<PartnerRecord> {
    return toRecord(
      await tx.partner.create({
        data: {
          tenantId: partner.tenantId,
          name: partner.name,
          slug: partner.slug,
          description: partner.description,
          partnerType: partner.partnerType,
          isHouse: partner.isHouse,
          status: partner.status,
          businessInfo: partner.businessInfo as Prisma.InputJsonValue,
          contactInfo: partner.contactInfo as Prisma.InputJsonValue,
          payoutInfo: partner.payoutInfo as Prisma.InputJsonValue,
        },
        include: partnerInclude,
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<PartnerRecord | null> {
    const p = await tx.partner.findUnique({ where: { id }, include: partnerInclude });
    return p ? toRecord(p) : null;
  }

  async findStateById(tx: PrismaTx, id: string): Promise<PartnerState | null> {
    const p = await tx.partner.findUnique({ where: { id } });
    return p ? toState(p) : null;
  }

  async findByIdForUpdate(tx: PrismaTx, id: string): Promise<PartnerState | null> {
    // Lock the row first (RLS scopes it to the current tenant), then read via
    // Prisma. A concurrent reviewer blocks here until this tx commits, then sees
    // the already-transitioned status and fails the pending gate.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM partners WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (locked.length === 0) return null;
    return this.findStateById(tx, id);
  }

  async findBySlug(tx: PrismaTx, slug: string): Promise<PartnerState | null> {
    // RLS scopes this to the current tenant; slug is unique per tenant.
    const p = await tx.partner.findFirst({ where: { slug } });
    return p ? toState(p) : null;
  }

  async list(
    tx: PrismaTx,
    filter: ListPartnersFilter,
  ): Promise<RepoPageWithCounts<PartnerRecord>> {
    // `baseWhere` carries every filter EXCEPT status, so each status tab's count
    // reflects the search box while ignoring the active tab. `items`/`total` use
    // the full `where` (status included) — filtered identically or the pager lies.
    const baseWhere: Prisma.PartnerWhereInput = filter.q
      ? {
          OR: [
            { name: { contains: filter.q, mode: 'insensitive' } },
            { slug: { contains: filter.q, mode: 'insensitive' } },
          ],
        }
      : {};
    const where: Prisma.PartnerWhereInput = {
      ...baseWhere,
      ...(filter.status ? { status: filter.status } : {}),
    };
    const { skip, take } = pageOffset(filter);
    const [items, total, countRows] = await Promise.all([
      tx.partner.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: partnerInclude,
      }),
      tx.partner.count({ where }),
      tx.partner.groupBy({ by: ['status'], where: baseWhere, _count: true }),
    ]);
    return { items: items.map(toRecord), total, counts: toStatusCounts(countRows) };
  }

  async updateStatus(
    tx: PrismaTx,
    id: string,
    intent: PartnerStatusIntent,
  ): Promise<PartnerRecord> {
    return toRecord(
      await tx.partner.update({
        where: { id },
        data: { status: intent.status },
        include: partnerInclude,
      }),
    );
  }

  async updateIdentitySubmission(
    tx: PrismaTx,
    id: string,
    intent: PartnerIdentitySubmissionIntent,
  ): Promise<PartnerRecord> {
    return toRecord(
      await tx.partner.update({
        where: { id },
        data: {
          verificationStatus: intent.verificationStatus,
          dateOfBirth: intent.dateOfBirth,
          identityInfo: intent.identityInfo as Prisma.InputJsonValue,
        },
        include: partnerInclude,
      }),
    );
  }

  async updateIdentityReview(
    tx: PrismaTx,
    id: string,
    intent: PartnerIdentityRejectionIntent | PartnerIdentityVerifiedIntent,
  ): Promise<PartnerRecord> {
    return toRecord(
      await tx.partner.update({
        where: { id },
        data: {
          verificationStatus: intent.verificationStatus,
          identityInfo: intent.identityInfo as Prisma.InputJsonValue,
          ...('verifiedAt' in intent ? { verifiedAt: intent.verifiedAt } : {}),
        },
        include: partnerInclude,
      }),
    );
  }

  async updatePayoutInfo(
    tx: PrismaTx,
    id: string,
    intent: PartnerPayoutIntent,
  ): Promise<PartnerRecord> {
    return toRecord(
      await tx.partner.update({
        where: { id },
        data: { payoutInfo: intent.payoutInfo as Prisma.InputJsonValue },
        include: partnerInclude,
      }),
    );
  }

  async updateBusinessInfo(
    tx: PrismaTx,
    id: string,
    intent: PartnerBusinessInfoIntent,
  ): Promise<PartnerRecord> {
    return toRecord(
      await tx.partner.update({
        where: { id },
        data: { businessInfo: intent.businessInfo as Prisma.InputJsonValue },
        include: partnerInclude,
      }),
    );
  }

  async updateDefaultCancellationPolicy(
    tx: PrismaTx,
    id: string,
    intent: PartnerDefaultCancellationPolicyIntent,
  ): Promise<PartnerRecord> {
    return toRecord(
      await tx.partner.update({
        where: { id },
        data: { defaultCancellationPolicyId: intent.defaultCancellationPolicyId },
        include: partnerInclude,
      }),
    );
  }

  async isCancellationPolicyVisible(
    tx: PrismaTx,
    partnerId: string,
    policyId: string,
  ): Promise<boolean> {
    const policy = await tx.cancellationPolicy.findFirst({
      where: { id: policyId, OR: [{ partnerId: null }, { partnerId }] },
      select: { id: true },
    });
    return policy !== null;
  }

  async addMember(
    tx: PrismaTx,
    params: { tenantId: string; partnerId: string; userId: string },
  ): Promise<void> {
    await tx.partnerMember.create({
      data: { tenantId: params.tenantId, partnerId: params.partnerId, userId: params.userId },
    });
  }

  async assignRole(
    tx: PrismaTx,
    params: { tenantId: string; partnerId: string; userId: string; roleId: string },
  ): Promise<void> {
    await tx.roleAssignment.create({
      data: {
        userId: params.userId,
        roleId: params.roleId,
        tenantId: params.tenantId,
        partnerId: params.partnerId,
      },
    });
  }

  async countActiveBookings(tx: PrismaTx, partnerId: string): Promise<number> {
    // §7.3: only FUTURE confirmed bookings block a suspend — one whose slot has
    // already ended can't leave a customer at a closed door. The slot end is the
    // upper bound of `timeslot` (time-based) or `blocked_period` (inventory);
    // `upper()` on a tstzrange needs raw SQL. RLS scopes this to the current tenant.
    const rows = await tx.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count
      FROM bookings
      WHERE partner_id = ${partnerId}::uuid
        AND status = 'confirmed'
        AND upper(COALESCE(timeslot, blocked_period)) > now()
    `;
    return Number(rows[0]?.count ?? 0n);
  }

  async tenantIdOfPartner(partnerId: string): Promise<string | null> {
    const p = await this.prisma.admin.partner.findUnique({
      where: { id: partnerId },
      select: { tenantId: true },
    });
    return p?.tenantId ?? null;
  }
}
