import { Injectable } from '@nestjs/common';
import {
  dashboardBrandConfigSchema,
  type ScopeLevel,
  type ScopeMembership,
} from '@booking/contracts';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { ISessionInfoReader } from '../../domain/ports/session-info-reader.port';

const SCOPE_ORDER: Record<ScopeLevel, number> = { platform: 0, tenant: 1, partner: 2 };

/**
 * Resolves a user's scope memberships on the admin (BYPASSRLS) pool — the lookup
 * runs before any tenant context exists, and reading the role_assignments IS the
 * membership check (a client can never grant itself a scope). One query pulls the
 * assignments + roles + permission keys; a second resolves partner display names
 * (partner is only an id on role_assignments, not a relation).
 */
@Injectable()
export class PrismaSessionInfoReader implements ISessionInfoReader {
  constructor(private readonly prisma: PrismaService) {}

  async listMemberships(userId: string): Promise<ScopeMembership[]> {
    const rows = await this.prisma.admin.roleAssignment.findMany({
      where: { userId },
      include: {
        role: { include: { rolePermissions: true } },
        tenant: {
          select: {
            id: true,
            name: true,
            themeConfig: true,
            domains: {
              where: { kind: 'dashboard', isPrimary: true, verifiedAt: { not: null } },
              select: { hostname: true },
              take: 1,
            },
          },
        },
      },
    });

    const partnerIds = [
      ...new Set(rows.map((r) => r.partnerId).filter((id): id is string => !!id)),
    ];
    const partners = partnerIds.length
      ? await this.prisma.admin.partner.findMany({
          where: { id: { in: partnerIds } },
          select: { id: true, name: true },
        })
      : [];
    const partnerName = new Map(partners.map((p) => [p.id, p.name]));

    const groups = new Map<string, ScopeMembership>();
    for (const row of rows) {
      const scope: ScopeLevel = row.partnerId ? 'partner' : row.tenantId ? 'tenant' : 'platform';
      const key = `${row.tenantId ?? '-'}:${row.partnerId ?? '-'}`;
      let membership = groups.get(key);
      if (!membership) {
        const branding = dashboardBrandConfigSchema.safeParse(row.tenant?.themeConfig);
        membership = {
          scope,
          tenantId: row.tenantId ?? null,
          tenantName: row.tenant?.name ?? null,
          partnerId: row.partnerId ?? null,
          partnerName: row.partnerId ? (partnerName.get(row.partnerId) ?? null) : null,
          tenantBranding: branding.success ? branding.data : null,
          adminHostname: row.tenant?.domains[0]?.hostname ?? null,
          roles: [],
          permissions: [],
        };
        groups.set(key, membership);
      }
      if (!membership.roles.includes(row.role.name)) membership.roles.push(row.role.name);
      for (const rp of row.role.rolePermissions) {
        if (!membership.permissions.includes(rp.permissionKey)) {
          membership.permissions.push(rp.permissionKey);
        }
      }
    }

    return [...groups.values()].sort(
      (a, b) =>
        SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
        (a.tenantName ?? '').localeCompare(b.tenantName ?? '') ||
        (a.partnerName ?? '').localeCompare(b.partnerName ?? ''),
    );
  }
}
