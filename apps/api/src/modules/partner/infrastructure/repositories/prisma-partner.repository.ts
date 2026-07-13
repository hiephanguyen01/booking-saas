import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreatePartnerData,
  IPartnerRepository,
  ListPartnersFilter,
  PartnerRecord,
  UpdatePartnerData,
} from '../../domain/ports/partner-repository.port';

type PrismaPartner = Prisma.PartnerGetPayload<Record<string, never>>;

function toRecord(p: PrismaPartner): PartnerRecord {
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
    createdAt: p.createdAt,
  };
}

/**
 * Partner data is tenant-scoped (RLS): tx methods run inside `forTenant`, so the
 * `app.tenant_id` GUC filters rows and satisfies the tenant_isolation WITH CHECK
 * on insert. Only `tenantIdOfPartner` runs on the admin pool (no tenant context).
 */
@Injectable()
export class PrismaPartnerRepository implements IPartnerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: PrismaTx, tenantId: string, data: CreatePartnerData): Promise<PartnerRecord> {
    return toRecord(
      await tx.partner.create({
        data: {
          tenantId,
          name: data.name,
          slug: data.slug,
          description: data.description ?? null,
          partnerType: data.partnerType,
          isHouse: data.isHouse ?? false,
          status: data.status ?? 'pending',
          businessInfo: (data.businessInfo ?? {}) as Prisma.InputJsonValue,
          contactInfo: (data.contactInfo ?? {}) as Prisma.InputJsonValue,
        },
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<PartnerRecord | null> {
    const p = await tx.partner.findUnique({ where: { id } });
    return p ? toRecord(p) : null;
  }

  async findByIdForUpdate(tx: PrismaTx, id: string): Promise<PartnerRecord | null> {
    // Lock the row first (RLS scopes it to the current tenant), then read via
    // Prisma. A concurrent reviewer blocks here until this tx commits, then sees
    // the already-transitioned status and fails the pending gate.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM partners WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (locked.length === 0) return null;
    return this.findById(tx, id);
  }

  async findBySlug(tx: PrismaTx, slug: string): Promise<PartnerRecord | null> {
    // RLS scopes this to the current tenant; slug is unique per tenant.
    const p = await tx.partner.findFirst({ where: { slug } });
    return p ? toRecord(p) : null;
  }

  async list(
    tx: PrismaTx,
    filter: ListPartnersFilter,
  ): Promise<{ items: PartnerRecord[]; total: number }> {
    const where: Prisma.PartnerWhereInput = filter.status ? { status: filter.status } : {};
    const [items, total] = await Promise.all([
      tx.partner.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      tx.partner.count({ where }),
    ]);
    return { items: items.map(toRecord), total };
  }

  async update(tx: PrismaTx, id: string, data: UpdatePartnerData): Promise<PartnerRecord> {
    return toRecord(
      await tx.partner.update({
        where: { id },
        data: {
          status: data.status,
          verificationStatus: data.verificationStatus,
          verifiedAt: data.verifiedAt,
          dateOfBirth: data.dateOfBirth,
          payoutInfo: data.payoutInfo as Prisma.InputJsonValue | undefined,
          identityInfo: data.identityInfo as Prisma.InputJsonValue | undefined,
          businessInfo: data.businessInfo as Prisma.InputJsonValue | undefined,
        },
      }),
    );
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
