import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import {
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
} from '../src/modules/identity-access/domain/permission-catalog';

/**
 * Seeds the permission catalog + system roles (idempotent), and in dev a
 * platform Super Admin account. Runs with the migration connection.
 */
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MIGRATE_DATABASE_URL } },
});

async function main() {
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

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@bookify.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin-dev-password';
  const superAdminRole = await prisma.role.findFirstOrThrow({
    where: { name: 'Super Admin', scopeLevel: 'platform', isSystem: true },
  });
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
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

  console.log(
    `Seeded ${PERMISSION_CATALOG.length} permissions, ${SYSTEM_ROLES.length} system roles, admin ${adminEmail}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
