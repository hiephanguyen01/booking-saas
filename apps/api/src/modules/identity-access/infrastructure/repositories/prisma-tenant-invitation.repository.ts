import { Injectable } from '@nestjs/common';
import type { PrismaClient, TenantInvitation } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateInvitationData,
  ITenantInvitationRepository,
  InvitationRow,
} from '../../domain/ports/tenant-invitation-repository.port';

type UserLookupClient = Pick<PrismaClient, 'user'>;

function toInvitationRow(row: TenantInvitation, invitedByName: string | null): InvitationRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
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
  rows: readonly TenantInvitation[],
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
      orderBy: { createdAt: 'desc' },
    });
    return attachInvitedByNames(tx, rows);
  }

  async create(tx: PrismaTx, data: CreateInvitationData): Promise<string> {
    const invitation = await tx.tenantInvitation.create({
      data: {
        tenantId: data.tenantId,
        email: data.email,
        roleIds: [...data.roleIds],
        tokenHash: data.tokenHash,
        invitedByUserId: data.invitedByUserId,
        expiresAt: data.expiresAt,
      },
    });
    return invitation.id;
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
      include: { tenant: { select: { name: true } } },
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
