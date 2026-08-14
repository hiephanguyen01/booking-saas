import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient, type TenantInvitation } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateInvitationData,
  ITenantInvitationRepository,
  InvitationRow,
} from '../../domain/ports/tenant-invitation-repository.port';
import { InvitationAlreadyPending } from '../../domain/errors/tenant-access-errors';

type UserLookupClient = Pick<PrismaClient, 'user'>;

/**
 * Every query producing an `InvitationRow` joins `tenant: { select: { name: true } } }`
 * and `partner: { select: { name: true } } }` — the latter is null for a tenant-scope row.
 */
type InvitationWithTenant = TenantInvitation & {
  tenant: { name: string };
  partner: { name: string } | null;
};

function toInvitationRow(row: InvitationWithTenant, invitedByName: string | null): InvitationRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenant.name,
    partnerId: row.partnerId,
    partnerName: row.partner?.name ?? null,
    email: row.email,
    roleIds: row.roleIds,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    invitedByName,
  };
}

/**
 * `tenant_invitations.invited_by_user_id` has no Prisma relation to `users`
 * (it's ON DELETE SET NULL, so the inviter may already be gone) — resolve
 * display names with a second query, the same two-step pattern
 * PrismaSessionInfoReader uses for partner names.
 */
async function attachInvitedByNames(
  client: UserLookupClient,
  rows: readonly InvitationWithTenant[],
): Promise<InvitationRow[]> {
  const userIds = [
    ...new Set(rows.map((r) => r.invitedByUserId).filter((id): id is string => id !== null)),
  ];
  const users = userIds.length
    ? await client.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.fullName]));
  return rows.map((row) =>
    toInvitationRow(row, row.invitedByUserId ? (nameById.get(row.invitedByUserId) ?? null) : null),
  );
}

@Injectable()
export class PrismaTenantInvitationRepository implements ITenantInvitationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(tx: PrismaTx, tenantId: string): Promise<InvitationRow[]> {
    const rows = await tx.tenantInvitation.findMany({
      where: { tenantId },
      include: { tenant: { select: { name: true } }, partner: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return attachInvitedByNames(tx, rows);
  }

  async create(tx: PrismaTx, data: CreateInvitationData): Promise<string> {
    try {
      const invitation = await tx.tenantInvitation.create({
        data: {
          tenantId: data.tenantId,
          partnerId: data.partnerId,
          email: data.email,
          roleIds: [...data.roleIds],
          tokenHash: data.tokenHash,
          invitedByUserId: data.invitedByUserId,
          expiresAt: data.expiresAt,
        },
      });
      return invitation.id;
    } catch (error) {
      // `tenant_invitations_pending_email_key` (partial unique on
      // (tenant_id, partner_id, email) NULLS NOT DISTINCT WHERE status = 'pending')
      // — a live invite already exists for this address in this scope. Never
      // let the raw Prisma error reach the client.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new InvitationAlreadyPending();
      }
      throw error;
    }
  }

  async revoke(tx: PrismaTx, tenantId: string, invitationId: string): Promise<boolean> {
    const { count } = await tx.tenantInvitation.updateMany({
      where: { id: invitationId, tenantId, status: 'pending' }, // CAS
      data: { status: 'revoked' },
    });
    return count === 1;
  }

  // ADMIN pool on purpose: no tenant context exists at accept time.
  async findByTokenHash(tokenHash: string): Promise<InvitationRow | null> {
    const row = await this.prisma.admin.tenantInvitation.findUnique({
      where: { tokenHash },
      include: { tenant: { select: { name: true } }, partner: { select: { name: true } } },
    });
    if (!row) return null;
    const [mapped] = await attachInvitedByNames(this.prisma.admin, [row]);
    return mapped ?? null;
  }

  async markAccepted(tx: PrismaTx, invitationId: string, userId: string): Promise<boolean> {
    const res = await tx.tenantInvitation.updateMany({
      where: { id: invitationId, status: 'pending' }, // CAS
      data: { status: 'accepted', acceptedAt: new Date(), acceptedUserId: userId },
    });
    return res.count === 1;
  }
}
