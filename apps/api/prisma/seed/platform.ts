import argon2 from 'argon2';
import {
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
} from '../../src/modules/identity-access/domain/permission-catalog';
import { prisma } from './client';
import type { PlatformAdminCredentials } from './scope';

const LEGACY_ADMIN_PASSWORD = 'admin-dev-password';

async function rotateKnownDefaultSuperAdmins(input: {
  superAdminRoleId: string;
  replacementPassword: string;
}): Promise<number> {
  if (input.replacementPassword === LEGACY_ADMIN_PASSWORD) return 0;

  const assignments = await prisma.roleAssignment.findMany({
    where: {
      roleId: input.superAdminRoleId,
      tenantId: null,
      partnerId: null,
    },
    select: { userId: true },
  });
  if (assignments.length === 0) return 0;

  const users = await prisma.user.findMany({
    where: { id: { in: assignments.map((assignment) => assignment.userId) } },
  });

  let rotated = 0;
  for (const user of users) {
    if (!user.passwordHash) continue;
    const usesKnownDefault = await argon2.verify(user.passwordHash, LEGACY_ADMIN_PASSWORD);
    if (!usesKnownDefault) continue;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(input.replacementPassword, { type: argon2.argon2id }),
      },
    });
    rotated += 1;
  }

  return rotated;
}

/**
 * Platform-level fixtures: the permission catalog, the system roles and the
 * Super Admin. Seeded in EVERY scope including production — the catalog is code,
 * not demo data, and the deny-by-default guard rejects every route without it.
 */
export async function seedPlatform(credentials: PlatformAdminCredentials): Promise<void> {
  for (const perm of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { scopeLevel: perm.scopeLevel },
      create: { key: perm.key, scopeLevel: perm.scopeLevel },
    });
  }

  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({
      where: { name: role.name, scopeLevel: role.scopeLevel, tenantId: null, isSystem: true },
    });
    const saved =
      existing ??
      (await prisma.role.create({
        data: { name: role.name, scopeLevel: role.scopeLevel, isSystem: true },
      }));
    await prisma.rolePermission.deleteMany({ where: { roleId: saved.id } });
    await prisma.rolePermission.createMany({
      data: role.permissions.map((permissionKey) => ({ roleId: saved.id, permissionKey })),
    });
  }

  const superAdminRole = await prisma.role.findFirstOrThrow({
    where: { name: 'Super Admin', scopeLevel: 'platform', isSystem: true },
  });
  const admin = await prisma.user.upsert({
    where: { email: credentials.email },
    update: {},
    create: {
      email: credentials.email,
      passwordHash: await argon2.hash(credentials.password, { type: argon2.argon2id }),
      fullName: 'Platform Admin',
    },
  });
  const assignment = await prisma.roleAssignment.findFirst({
    where: { userId: admin.id, roleId: superAdminRole.id, tenantId: null, partnerId: null },
  });
  if (!assignment) {
    await prisma.roleAssignment.create({
      data: { userId: admin.id, roleId: superAdminRole.id },
    });
  }

  const rotatedAdminCount = await rotateKnownDefaultSuperAdmins({
    superAdminRoleId: superAdminRole.id,
    replacementPassword: credentials.password,
  });

  console.log(
    `Seeded ${PERMISSION_CATALOG.length} permissions, ${SYSTEM_ROLES.length} system roles, admin ${credentials.email}`,
  );
  if (rotatedAdminCount > 0) {
    console.log(
      `Rotated ${rotatedAdminCount} Super Admin account(s) away from the shared development password.`,
    );
  }
}
