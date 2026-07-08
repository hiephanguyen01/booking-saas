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

  if (process.env.SEED_DEMO !== 'false') {
    await seedDemo();
  }
}

/**
 * Demo tenant (TONG-QUAN.md §5 seed.ts): one studio-vertical tenant (StudioHub)
 * with a company partner + a house partner, dynamic listing types, two-tier
 * posts with rooms, an inventory listing with a security deposit, commission
 * rules, and a basic promo. Idempotent — safe to re-run. Runs on the migrate
 * (superuser) connection, which bypasses RLS, so cross-tenant inserts are fine.
 */
async function seedDemo(): Promise<void> {
  const password = await argon2.hash(process.env.SEED_DEMO_PASSWORD ?? 'demo-password', {
    type: argon2.argon2id,
  });

  // ── Users ──────────────────────────────────────────────────────────────────
  const owner = await prisma.user.upsert({
    where: { email: 'owner@studiohub.vn' },
    update: {},
    create: {
      email: 'owner@studiohub.vn',
      passwordHash: password,
      fullName: 'StudioHub Owner',
      phone: '0900000001',
      emailVerifiedAt: new Date(),
    },
  });
  const partnerUser = await prisma.user.upsert({
    where: { email: 'giang@giangstudio.vn' },
    update: {},
    create: {
      email: 'giang@giangstudio.vn',
      passwordHash: password,
      fullName: 'Giang Studio',
      phone: '0900000002',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.user.upsert({
    where: { email: 'customer@studiohub.vn' },
    update: {},
    create: { email: 'customer@studiohub.vn', passwordHash: password, fullName: 'Nguyen Van Khach' },
  });

  // ── Tenant + domains + subscription ─────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'studiohub' },
    update: {},
    create: {
      name: 'StudioHub',
      slug: 'studiohub',
      vertical: 'studio',
      themeConfig: {
        colors: { primary: '#0EA5E9', accent: '#F97316', background: '#FFFFFF' },
        hero: { title: 'Đặt studio trong 30 giây', subtitle: 'Chụp ảnh chuyên nghiệp' },
      },
    },
  });
  for (const [hostname, isPrimary] of [
    ['studiohub.bookify.vn', true],
    ['studiohub.vn', false],
  ] as const) {
    await prisma.tenantDomain.upsert({
      where: { hostname },
      update: {},
      create: { tenantId: tenant.id, hostname, isPrimary, verifiedAt: new Date() },
    });
  }
  const plan = await prisma.subscriptionPlan.upsert({
    where: { name: 'Studio Pro' },
    update: {},
    create: {
      name: 'Studio Pro',
      priceMonthly: 990_000n,
      limits: {
        maxPartners: 50,
        maxListings: 500,
        maxBookingsPerMonth: 5000,
        customDomain: true,
        affiliateModule: true,
      },
    },
  });
  if (!(await prisma.tenantSubscription.findFirst({ where: { tenantId: tenant.id } }))) {
    const now = new Date();
    await prisma.tenantSubscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: 'active',
        startsAt: now,
        expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
        note: 'Demo — manual invoicing',
      },
    });
  }

  // ── Role assignments (tenant owner) ─────────────────────────────────────────
  const tenantOwnerRole = await prisma.role.findFirstOrThrow({
    where: { name: 'Tenant Owner', scopeLevel: 'tenant', isSystem: true },
  });
  const partnerOwnerRole = await prisma.role.findFirstOrThrow({
    where: { name: 'Partner Owner', scopeLevel: 'partner', isSystem: true },
  });
  await ensureRoleAssignment(owner.id, tenantOwnerRole.id, tenant.id, null);

  // ── Partners (a company partner + a house partner) ──────────────────────────
  const partner = await prisma.partner.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'giang-studio' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Giang Studio',
      slug: 'giang-studio',
      description: 'Studio chụp ảnh chuyên nghiệp tại Q1',
      partnerType: 'company',
      status: 'approved',
      verifiedAt: new Date(),
      businessInfo: { taxId: '0312345678' },
      contactInfo: { phone: '0900000002', address: '12 Nguyen Hue, Q1, HCMC' },
      payoutInfo: { bank: 'Vietcombank', account: '0011223344', holder: 'CONG TY GIANG STUDIO' },
    },
  });
  await ensureRoleAssignment(partnerUser.id, partnerOwnerRole.id, tenant.id, partner.id);
  if (!(await prisma.partnerMember.findFirst({ where: { partnerId: partner.id, userId: partnerUser.id } }))) {
    await prisma.partnerMember.create({
      data: { tenantId: tenant.id, partnerId: partner.id, userId: partnerUser.id },
    });
  }
  const housePartner = await prisma.partner.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'studiohub-house' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'StudioHub House',
      slug: 'studiohub-house',
      partnerType: 'company',
      isHouse: true,
      status: 'approved',
    },
  });

  // ── Listing types (dynamic, tenant-defined) ─────────────────────────────────
  const studioType = await upsertListingType(tenant.id, {
    name: 'Studio',
    slug: 'studio',
    allowedModes: ['hourly', 'daily'],
    defaultModes: ['hourly'],
    unitLabel: 'giờ',
    sortOrder: 1,
    attributeSchema: [
      { key: 'area', label: 'Diện tích (m²)', type: 'number', filterable: true },
      { key: 'style', label: 'Phong cách', type: 'select', filterable: true, options: ['Hàn Quốc', 'Vintage', 'Tối giản'] },
    ],
  });
  await upsertListingType(tenant.id, {
    name: 'Model Booking',
    slug: 'model',
    allowedModes: ['hourly', 'daily'],
    defaultModes: ['hourly'],
    unitLabel: 'giờ',
    sortOrder: 2,
    attributeSchema: [
      { key: 'height', label: 'Chiều cao (cm)', type: 'number', filterable: true },
      { key: 'portfolio', label: 'Portfolio', type: 'text' },
    ],
  });
  const equipmentType = await upsertListingType(tenant.id, {
    name: 'Equipment Rental',
    slug: 'equipment',
    allowedModes: ['inventory'],
    defaultModes: ['inventory'],
    unitLabel: 'ngày',
    sortOrder: 3,
    attributeSchema: [
      { key: 'brand', label: 'Hãng', type: 'text', filterable: true },
      { key: 'model', label: 'Model', type: 'text' },
    ],
  });

  // ── Categories + cancellation policy ────────────────────────────────────────
  const category = await prisma.category.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'chup-chan-dung' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Chụp chân dung', slug: 'chup-chan-dung' },
  });
  const cancelPolicy = await ensure(
    () => prisma.cancellationPolicy.findFirst({ where: { tenantId: tenant.id, name: 'Linh hoạt' } }),
    () =>
      prisma.cancellationPolicy.create({
        data: {
          tenantId: tenant.id,
          name: 'Linh hoạt',
          rules: [
            { hoursBefore: 168, refundPercent: 100 },
            { hoursBefore: 48, refundPercent: 50 },
            { hoursBefore: 0, refundPercent: 0 },
          ],
        },
      }),
  );

  // ── Two-tier post: a Studio group with two room listings sharing nothing ────
  const group = await prisma.listingGroup.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'giang-studio-q1' } },
    update: {},
    create: {
      tenantId: tenant.id,
      partnerId: partner.id,
      listingTypeId: studioType.id,
      title: 'Giang Studio Q1',
      slug: 'giang-studio-q1',
      description: 'Hệ thống 2 phòng studio ánh sáng tự nhiên, ngay trung tâm Q1.',
      address: '12 Nguyen Hue, Q1, HCMC',
      status: 'published',
      publishedBy: 'partner',
      amenities: ['Lễ tân', 'Chỗ đậu xe', 'Máy lạnh'],
    },
  });

  await upsertRoomListing(tenant.id, partner.id, studioType.id, {
    title: 'Studio A — Hàn Quốc',
    slug: 'studio-a-han-quoc',
    groupId: group.id,
    categoryId: category.id,
    cancellationPolicyId: cancelPolicy.id,
    bookingModes: ['hourly', 'daily'],
    attributes: { area: 40, style: 'Hàn Quốc' },
    modeConfig: {
      hourly: {
        basePrice: 300_000,
        blocks: [
          { hours: 2, price: 500_000 },
          { hours: 3, price: 700_000 },
        ],
        minDuration: 1,
        maxDuration: 8,
        granularity: 60,
        leadTimeMin: 60,
      },
      daily: {
        basePricePerNight: 1_800_000,
        minNights: 1,
        maxNights: 7,
        checkinTime: '08:00',
        checkoutTime: '20:00',
        leadTimeMin: 120,
      },
    },
    bufferBefore: 30,
    bufferAfter: 30,
    depositPercent: 50,
  });
  await upsertRoomListing(tenant.id, partner.id, studioType.id, {
    title: 'Studio B — Vintage',
    slug: 'studio-b-vintage',
    groupId: group.id,
    categoryId: category.id,
    cancellationPolicyId: cancelPolicy.id,
    bookingModes: ['hourly'],
    attributes: { area: 25, style: 'Vintage' },
    modeConfig: {
      hourly: {
        basePrice: 250_000,
        blocks: [{ hours: 2, price: 450_000 }],
        minDuration: 1,
        maxDuration: 6,
        granularity: 60,
        leadTimeMin: 60,
      },
    },
    bufferBefore: 30,
    bufferAfter: 30,
    depositPercent: 100,
  });

  // ── Standalone inventory listing (equipment) with a security deposit ────────
  await upsertRoomListing(tenant.id, housePartner.id, equipmentType.id, {
    title: 'Sony FX3 (Cinema camera)',
    slug: 'sony-fx3',
    groupId: null,
    categoryId: null,
    cancellationPolicyId: cancelPolicy.id,
    bookingModes: ['inventory'],
    attributes: { brand: 'Sony', model: 'FX3' },
    modeConfig: { inventory: { unit: 'day', basePrice: 800_000, securityDeposit: 5_000_000 } },
    stockQuantity: 3,
    bufferBefore: 120,
    bufferAfter: 120,
    depositPercent: 100,
  });

  // ── Commission rules (tenant default + a per-type override) ──────────────────
  await ensure(
    () =>
      prisma.commissionRule.findFirst({
        where: { tenantId: tenant.id, appliesTo: 'tenant_default' },
      }),
    () =>
      prisma.commissionRule.create({
        data: {
          tenantId: tenant.id,
          appliesTo: 'tenant_default',
          tenantRateType: 'percent',
          tenantRate: 15n,
          platformRate: 2,
          affiliateRateType: 'percent',
          affiliateRate: 5n,
          effectiveFrom: new Date(),
        },
      }),
  );
  await ensure(
    () =>
      prisma.commissionRule.findFirst({
        where: { tenantId: tenant.id, appliesTo: 'listing_type', listingTypeId: equipmentType.id },
      }),
    () =>
      prisma.commissionRule.create({
        data: {
          tenantId: tenant.id,
          appliesTo: 'listing_type',
          listingTypeId: equipmentType.id,
          tenantRateType: 'percent',
          tenantRate: 10n,
          platformRate: 2,
          affiliateRateType: 'percent',
          affiliateRate: 0n,
          effectiveFrom: new Date(),
        },
      }),
  );

  // ── A basic promo code ───────────────────────────────────────────────────────
  await prisma.promotion.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'WELCOME10' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Chào mừng khách mới',
      code: 'WELCOME10',
      discountType: 'percent',
      discountValue: 10n,
      maxDiscount: 200_000n,
      fundedBy: 'tenant',
      appliesTo: 'all',
      minOrderAmount: 500_000n,
      usageLimitTotal: 1000,
      status: 'active',
      startsAt: new Date(),
    },
  });

  console.log(
    `Seeded demo tenant "${tenant.name}" (2 partners, 3 listing types, 3 listings, commission rules, WELCOME10).`,
  );
}

// ── Small idempotency helpers ─────────────────────────────────────────────────

async function ensure<T>(find: () => Promise<T | null>, create: () => Promise<T>): Promise<T> {
  return (await find()) ?? (await create());
}

async function ensureRoleAssignment(
  userId: string,
  roleId: string,
  tenantId: string | null,
  partnerId: string | null,
): Promise<void> {
  const existing = await prisma.roleAssignment.findFirst({
    where: { userId, roleId, tenantId, partnerId },
  });
  if (!existing) {
    await prisma.roleAssignment.create({ data: { userId, roleId, tenantId, partnerId } });
  }
}

async function upsertListingType(
  tenantId: string,
  input: {
    name: string;
    slug: string;
    allowedModes: string[];
    defaultModes: string[];
    unitLabel: string;
    sortOrder: number;
    attributeSchema: unknown;
  },
) {
  return prisma.listingType.upsert({
    where: { tenantId_slug: { tenantId, slug: input.slug } },
    update: {},
    create: {
      tenantId,
      name: input.name,
      slug: input.slug,
      allowedModes: input.allowedModes as never,
      defaultModes: input.defaultModes as never,
      unitLabel: input.unitLabel,
      sortOrder: input.sortOrder,
      attributeSchema: input.attributeSchema as never,
    },
  });
}

async function upsertRoomListing(
  tenantId: string,
  partnerId: string,
  listingTypeId: string,
  input: {
    title: string;
    slug: string;
    groupId: string | null;
    categoryId: string | null;
    cancellationPolicyId: string | null;
    bookingModes: string[];
    attributes: unknown;
    modeConfig: unknown;
    stockQuantity?: number;
    bufferBefore: number;
    bufferAfter: number;
    depositPercent: number;
  },
) {
  const existing = await prisma.listing.findUnique({
    where: { tenantId_slug: { tenantId, slug: input.slug } },
  });
  if (existing) return existing;

  // Each listing gets its own calendar-holding resource 1:1 by default (§7.3).
  const resource = await prisma.resource.create({
    data: { tenantId, partnerId, name: input.title },
  });
  return prisma.listing.create({
    data: {
      tenantId,
      partnerId,
      listingTypeId,
      resourceId: resource.id,
      groupId: input.groupId,
      categoryId: input.categoryId,
      cancellationPolicyId: input.cancellationPolicyId,
      title: input.title,
      slug: input.slug,
      bookingModes: input.bookingModes as never,
      attributes: input.attributes as never,
      modeConfig: input.modeConfig as never,
      stockQuantity: input.stockQuantity,
      bufferBefore: input.bufferBefore,
      bufferAfter: input.bufferAfter,
      depositPercent: input.depositPercent,
      status: 'published',
      publishedBy: 'partner',
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
