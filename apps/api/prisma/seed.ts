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

  // Time anchors for the platform-health fixtures further below. The tenant is
  // backdated so its realized bookings yield a positive time-to-first-booking,
  // and so recent bookings/payouts land inside the board's 30-day / overdue
  // windows (§13.3, GetPlatformHealthUseCase).
  const seedNow = Date.now();
  const daysAgo = (days: number): Date => new Date(seedNow - days * 24 * 60 * 60 * 1000);
  const daysFromNow = (days: number): Date => new Date(seedNow + days * 24 * 60 * 60 * 1000);
  const atHour = (day: Date, hour: number): Date => {
    const d = new Date(day);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };
  const tenantCreatedAt = daysAgo(45);

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
  const customer = await prisma.user.upsert({
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
      createdAt: tenantCreatedAt,
      themeConfig: {
        colors: { primary: '#0EA5E9', accent: '#F97316', background: '#FFFFFF' },
        hero: { title: 'Đặt studio trong 30 giây', subtitle: 'Chụp ảnh chuyên nghiệp' },
      },
    },
  });
  for (const [hostname, isPrimary] of [
    ['studiohub.bookify.vn', true],
    ['studiohub.vn', false],
    // Local dev hosts so the storefront resolves on localhost/127.0.0.1.
    ['localhost', false],
    ['127.0.0.1', false],
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
      payoutInfo: { bank: 'Vietcombank', accountNumber: '0011223344', holderName: 'CONG TY GIANG STUDIO' },
    },
  });
  await ensureRoleAssignment(partnerUser.id, partnerOwnerRole.id, tenant.id, partner.id);
  if (!(await prisma.partnerMember.findFirst({ where: { partnerId: partner.id, userId: partnerUser.id } }))) {
    await prisma.partnerMember.create({
      data: { tenantId: tenant.id, partnerId: partner.id, userId: partnerUser.id },
    });
  }
  // Fee-schedule + terms acceptance recorded at approval (§7.2).
  for (const agreementType of ['partner_terms', 'commission_schedule'] as const) {
    if (!(await prisma.agreementAcceptance.findFirst({ where: { partnerId: partner.id, agreementType } }))) {
      await prisma.agreementAcceptance.create({
        data: { tenantId: tenant.id, partnerId: partner.id, userId: partnerUser.id, agreementType, version: '2026-01' },
      });
    }
  }
  // A pending individual partner — the approval-queue + identity-verification fixture.
  const applicantUser = await prisma.user.upsert({
    where: { email: 'trang@makeup.vn' },
    update: {},
    create: { email: 'trang@makeup.vn', passwordHash: password, fullName: 'Tran Thi Trang', phone: '0900000003' },
  });
  const pendingPartner = await prisma.partner.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'trang-makeup' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Trang Makeup',
      slug: 'trang-makeup',
      partnerType: 'individual',
      status: 'pending',
      verificationStatus: 'pending',
      dateOfBirth: new Date('1996-05-20T00:00:00.000Z'),
      contactInfo: { phone: '0900000003' },
      payoutInfo: { bank: 'Techcombank', accountNumber: '9988776655', holderName: 'TRAN THI TRANG' },
      identityInfo: { documentType: 'national_id', documentNumber: '079196000123', holderName: 'TRAN THI TRANG' },
    },
  });
  await ensureRoleAssignment(applicantUser.id, partnerOwnerRole.id, tenant.id, pendingPartner.id);
  if (!(await prisma.partnerMember.findFirst({ where: { partnerId: pendingPartner.id, userId: applicantUser.id } }))) {
    await prisma.partnerMember.create({
      data: { tenantId: tenant.id, partnerId: pendingPartner.id, userId: applicantUser.id },
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
      { key: 'naturalLight', label: 'Ánh sáng tự nhiên', type: 'boolean', filterable: true },
    ],
  });
  await upsertListingType(tenant.id, {
    name: 'Model Booking',
    slug: 'model',
    allowedModes: ['hourly', 'daily'],
    defaultModes: ['hourly'],
    unitLabel: 'giờ',
    sortOrder: 2,
    // People-booking type: the partner must be identity-verified to serve it (§7.3, Task 1.2).
    requiresIdentityVerification: true,
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
      photos: [
        'https://picsum.photos/seed/giang-q1-1/1200/900',
        'https://picsum.photos/seed/giang-q1-2/1200/900',
      ],
    },
  });

  const studioA = await upsertRoomListing(tenant.id, partner.id, studioType.id, {
    title: 'Studio A — Hàn Quốc',
    slug: 'studio-a-han-quoc',
    photos: [
      'https://picsum.photos/seed/studio-a-1/1200/900',
      'https://picsum.photos/seed/studio-a-2/1200/900',
      'https://picsum.photos/seed/studio-a-3/1200/900',
      'https://picsum.photos/seed/studio-a-4/1200/900',
      'https://picsum.photos/seed/studio-a-5/1200/900',
    ],
    groupId: group.id,
    categoryId: category.id,
    cancellationPolicyId: cancelPolicy.id,
    bookingModes: ['hourly', 'daily'],
    attributes: { area: 40, style: 'Hàn Quốc', naturalLight: true },
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
  const studioB = await upsertRoomListing(tenant.id, partner.id, studioType.id, {
    title: 'Studio B — Vintage',
    slug: 'studio-b-vintage',
    photos: [
      'https://picsum.photos/seed/studio-b-1/1200/900',
      'https://picsum.photos/seed/studio-b-2/1200/900',
      'https://picsum.photos/seed/studio-b-3/1200/900',
      'https://picsum.photos/seed/studio-b-4/1200/900',
    ],
    groupId: group.id,
    categoryId: category.id,
    cancellationPolicyId: cancelPolicy.id,
    bookingModes: ['hourly'],
    attributes: { area: 25, style: 'Vintage', naturalLight: false },
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

  // Weekly opening hours so the hourly slot picker has bookable slots (§9.1).
  await ensureWeeklyRules(tenant.id, studioA.id);
  await ensureWeeklyRules(tenant.id, studioB.id);

  // ── Golden-hour pricing rule on Studio A (18:00–22:00 costs more) ───────────
  if (!(await prisma.pricingRule.findFirst({ where: { listingId: studioA.id, ruleType: 'time_range' } }))) {
    await prisma.pricingRule.create({
      data: {
        tenantId: tenant.id,
        listingId: studioA.id,
        bookingMode: 'hourly',
        ruleType: 'time_range',
        params: { from: '18:00', to: '22:00' },
        price: 450_000n, // vs the 300k base per-hour rate
        priority: 10,
      },
    });
  }

  // ── Standalone inventory listing (equipment) with a security deposit ────────
  await upsertRoomListing(tenant.id, housePartner.id, equipmentType.id, {
    title: 'Sony FX3 (Cinema camera)',
    slug: 'sony-fx3',
    photos: [
      'https://picsum.photos/seed/sony-fx3-1/1200/900',
      'https://picsum.photos/seed/sony-fx3-2/1200/900',
      'https://picsum.photos/seed/sony-fx3-3/1200/900',
    ],
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

  // ── Advanced promotions (Phase 2, §12) ───────────────────────────────────────
  // Let partners create their own codes on this tenant (the per-tenant toggle).
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { settings: { ...(tenant.settings as Record<string, unknown>), partnerPromotionsEnabled: true } },
  });

  // An auto-applied campaign (no code) — off-peak Fri/Sat evenings on Studio listings.
  if (!(await prisma.promotion.findFirst({ where: { tenantId: tenant.id, name: 'Giờ vàng cuối tuần' } }))) {
    await prisma.promotion.create({
      data: {
        tenantId: tenant.id,
        name: 'Giờ vàng cuối tuần',
        code: null, // auto-applied — no code needed
        discountType: 'percent',
        discountValue: 15n,
        maxDiscount: 300_000n,
        fundedBy: 'tenant',
        appliesTo: 'listing_type',
        appliesToId: studioType.id,
        timeWindows: [{ days: [5, 6], from: '18:00', to: '23:00' }],
        status: 'active',
        startsAt: new Date(),
      },
    });
  }

  // A tenant-created partner-funded code, pending the partner's opt-in (gated until accepted).
  await prisma.promotion.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'PARTNER15' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Đối tác tài trợ 15%',
      code: 'PARTNER15',
      discountType: 'percent',
      discountValue: 15n,
      fundedBy: 'partner',
      appliesTo: 'listing',
      appliesToId: studioA.id,
      fundingPartnerId: partner.id,
      partnerOptInAt: null, // pending — will not apply until the partner opts in (§12.2)
      status: 'active',
      startsAt: new Date(),
    },
  });

  // ── Platform-health fixtures (Task 1.12 admin board) ────────────────────────
  // Without realized bookings/payouts/failures the health board renders all
  // zeros. Seed a small, idempotent scenario so GMV, gmv30d, bookings30d,
  // time-to-first-booking, overdue payouts, webhook failures and the
  // expiring-subscription queue are all demonstrably non-empty.
  await seedBooking({
    tenantId: tenant.id,
    listingId: studioA.id,
    partnerId: partner.id,
    resourceId: studioA.resourceId,
    customerId: customer.id,
    code: 'BK-HEALTH01',
    idempotencyKey: 'seed-health-booking-1',
    status: 'completed',
    finalAmount: 700_000,
    createdAt: daysAgo(40), // first realized booking → sets time-to-first-booking
    startAt: atHour(daysAgo(39), 9),
    endAt: atHour(daysAgo(39), 11),
  });
  await seedBooking({
    tenantId: tenant.id,
    listingId: studioA.id,
    partnerId: partner.id,
    resourceId: studioA.resourceId,
    customerId: customer.id,
    code: 'BK-HEALTH02',
    idempotencyKey: 'seed-health-booking-2',
    status: 'confirmed', // upcoming → constrained by the GiST exclusion (future slot)
    finalAmount: 500_000,
    createdAt: daysAgo(12),
    startAt: atHour(daysFromNow(3), 14),
    endAt: atHour(daysFromNow(3), 16),
  });
  await seedBooking({
    tenantId: tenant.id,
    listingId: studioA.id,
    partnerId: partner.id,
    resourceId: studioA.resourceId,
    customerId: customer.id,
    code: 'BK-HEALTH03',
    idempotencyKey: 'seed-health-booking-3',
    status: 'completed',
    finalAmount: 1_800_000,
    createdAt: daysAgo(4),
    startAt: atHour(daysAgo(3), 8),
    endAt: atHour(daysAgo(3), 12),
  });

  // An overdue partner payout: still pending with period_to in the past.
  if (
    !(await prisma.payout.findFirst({
      where: { tenantId: tenant.id, payeeType: 'partner', payeeId: partner.id },
    }))
  ) {
    await prisma.payout.create({
      data: {
        tenantId: tenant.id,
        payeeType: 'partner',
        payeeId: partner.id,
        amount: 1_275_000n,
        periodFrom: daysAgo(37),
        periodTo: daysAgo(7), // < now → counts as overdue on the board
        status: 'pending',
      },
    });
  }

  // A failed, still-unprocessed outbox event → the "webhook failures" counter.
  if (
    !(await prisma.outboxEvent.findFirst({
      where: { tenantId: tenant.id, eventType: 'payment.webhook.failed', processedAt: null },
    }))
  ) {
    await prisma.outboxEvent.create({
      data: {
        tenantId: tenant.id,
        aggregateType: 'payment',
        eventType: 'payment.webhook.failed',
        payload: { gateway: 'payos', reason: 'signature verification timed out' },
        attempts: 5,
        lastError: 'PayOS webhook signature verification failed after 5 attempts',
      },
    });
  }

  // A second, small tenant whose trial subscription is about to lapse feeds the
  // "expiring soon" queue — the primary demo tenant keeps a healthy 1-year plan.
  const apertureTheme = {
    colors: { primary: '#7C3AED', accent: '#F59E0B', background: '#FAFAF9' },
    hero: {
      title: 'Thuê homestay theo ngày',
      subtitle: 'Không gian nghỉ dưỡng chọn lọc, đặt phòng chỉ trong vài phút.',
    },
    seo: {
      title: 'Aperture Rentals — Homestay theo ngày',
      description: 'Đặt homestay đẹp theo ngày với Aperture Rentals.',
    },
  };
  const trialTenant = await prisma.tenant.upsert({
    where: { slug: 'aperture-rentals' },
    update: { themeConfig: apertureTheme },
    create: {
      name: 'Aperture Rentals',
      slug: 'aperture-rentals',
      vertical: 'rental',
      createdAt: daysAgo(20),
      themeConfig: apertureTheme,
    },
  });
  if (!(await prisma.tenantSubscription.findFirst({ where: { tenantId: trialTenant.id } }))) {
    await prisma.tenantSubscription.create({
      data: {
        tenantId: trialTenant.id,
        planId: plan.id,
        status: 'trial',
        startsAt: daysAgo(9),
        expiresAt: daysFromNow(5), // within the board's 14-day expiry window
        note: 'Demo — trial expiring soon',
      },
    });
  }

  // Make the second tenant a fully resolvable, themeable storefront (DoD 1.15:
  // the journey must be clickable on two tenants with different themes/domains).
  // `aperture.localhost` resolves to loopback in every browser.
  for (const [hostname, isPrimary] of [
    ['aperture.bookify.vn', true],
    ['aperture.localhost', false],
  ] as const) {
    await prisma.tenantDomain.upsert({
      where: { hostname },
      update: {},
      create: { tenantId: trialTenant.id, hostname, isPrimary, verifiedAt: new Date() },
    });
  }
  // Aperture gets its OWN owner — never reuse StudioHub's `owner`, or that account
  // would belong to two tenants and the dashboard (one tenant scope per session)
  // would resolve the wrong one. Repair any earlier seed that made that mistake.
  await prisma.roleAssignment.deleteMany({ where: { userId: owner.id, tenantId: trialTenant.id } });
  const apertureOwner = await prisma.user.upsert({
    where: { email: 'owner@aperture.vn' },
    update: {},
    create: {
      email: 'owner@aperture.vn',
      passwordHash: password,
      fullName: 'Aperture Owner',
      phone: '0900000010',
      emailVerifiedAt: new Date(),
    },
  });
  await ensureRoleAssignment(apertureOwner.id, tenantOwnerRole.id, trialTenant.id, null);
  const aperturePartner = await prisma.partner.upsert({
    where: { tenantId_slug: { tenantId: trialTenant.id, slug: 'aperture-house' } },
    update: {},
    create: {
      tenantId: trialTenant.id,
      name: 'Aperture House',
      slug: 'aperture-house',
      partnerType: 'company',
      isHouse: true,
      status: 'approved',
      verifiedAt: new Date(),
    },
  });
  const homestayType = await upsertListingType(trialTenant.id, {
    name: 'Homestay',
    slug: 'homestay',
    allowedModes: ['daily'],
    defaultModes: ['daily'],
    unitLabel: 'đêm',
    sortOrder: 1,
    attributeSchema: [
      { key: 'bedrooms', label: 'Số phòng ngủ', type: 'number', filterable: true },
      { key: 'view', label: 'Hướng nhìn', type: 'select', filterable: true, options: ['Biển', 'Thành phố', 'Núi'] },
    ],
  });
  const homestay = await upsertRoomListing(trialTenant.id, aperturePartner.id, homestayType.id, {
    title: 'Villa Aperture — Homestay ven biển',
    slug: 'villa-aperture-ven-bien',
    photos: [
      'https://picsum.photos/seed/aperture-1/1200/900',
      'https://picsum.photos/seed/aperture-2/1200/900',
      'https://picsum.photos/seed/aperture-3/1200/900',
    ],
    groupId: null,
    categoryId: null,
    cancellationPolicyId: null,
    bookingModes: ['daily'],
    attributes: { bedrooms: 3, view: 'Biển' },
    modeConfig: {
      daily: {
        basePricePerNight: 2_500_000,
        minNights: 1,
        maxNights: 14,
        checkinTime: '14:00',
        checkoutTime: '12:00',
        leadTimeMin: 0,
      },
    },
    bufferBefore: 0,
    bufferAfter: 0,
    depositPercent: 50,
  });
  // Daily mode is open by default without rules, but seed them so the calendar is explicit.
  await ensureWeeklyRules(trialTenant.id, homestay.id, '00:00', '23:59');

  // ── Affiliate (§15) ─────────────────────────────────────────────────────────
  // An approved affiliate + a referral link so both dashboards render non-empty.
  // Commissions populate through the real booking flow (?ref=R-DEMO01 at checkout).
  const affiliateUser = await prisma.user.upsert({
    where: { email: 'affiliate@studiohub.vn' },
    update: {},
    create: { email: 'affiliate@studiohub.vn', passwordHash: password, fullName: 'Le Thi Cong Tac Vien' },
  });
  const affiliate = await prisma.affiliate.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: affiliateUser.id } },
    update: { status: 'approved' },
    create: {
      tenantId: tenant.id,
      userId: affiliateUser.id,
      status: 'approved',
      payoutInfo: { bankName: 'Vietcombank', accountNo: '0123456789', accountHolder: 'LE THI CONG TAC VIEN' },
    },
  });
  if (!(await prisma.referralLink.findFirst({ where: { tenantId: tenant.id, code: 'R-DEMO01' } }))) {
    await prisma.referralLink.create({
      data: { tenantId: tenant.id, affiliateId: affiliate.id, code: 'R-DEMO01', target: 'tenant_home' },
    });
  }

  console.log(
    `Seeded demo tenant "${tenant.name}" (3 partners incl. a pending individual, 3 listing types, 3 listings + weekly hours, commission rules, WELCOME10) + a second themed storefront "Aperture Rentals" (aperture.localhost, 1 homestay/daily listing, trial expiring soon) + health fixtures (3 bookings, 1 overdue payout, 1 webhook failure) + an approved affiliate (affiliate@studiohub.vn) with referral link R-DEMO01.`,
  );
}

// ── Small idempotency helpers ─────────────────────────────────────────────────

async function ensure<T>(find: () => Promise<T | null>, create: () => Promise<T>): Promise<T> {
  return (await find()) ?? (await create());
}

/**
 * Seeds one realized (`confirmed`/`completed`) hourly booking for the health
 * board. `timeslot`/`blocked_period` are Prisma `Unsupported("tstzrange")`, so
 * they are written via raw SQL after the insert. Slots must be non-overlapping
 * per resource for `confirmed` rows (the GiST exclusion constraint). Idempotent
 * on `(tenantId, idempotencyKey)`.
 */
async function seedBooking(input: {
  tenantId: string;
  listingId: string;
  partnerId: string;
  resourceId: string;
  customerId: string;
  code: string;
  idempotencyKey: string;
  status: 'confirmed' | 'completed';
  finalAmount: number;
  createdAt: Date;
  startAt: Date;
  endAt: Date;
}) {
  const existing = await prisma.booking.findFirst({
    where: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
  });
  if (existing) return existing;

  const amount = BigInt(input.finalAmount);
  const booking = await prisma.booking.create({
    data: {
      tenantId: input.tenantId,
      listingId: input.listingId,
      partnerId: input.partnerId,
      resourceId: input.resourceId,
      customerId: input.customerId,
      code: input.code,
      idempotencyKey: input.idempotencyKey,
      bookingMode: 'hourly',
      status: input.status,
      totalAmount: amount,
      finalAmount: amount,
      depositAmount: amount / 2n,
      paidAmount: amount,
      createdAt: input.createdAt,
    },
  });
  await prisma.$executeRaw`
    UPDATE bookings
       SET timeslot = tstzrange(${input.startAt}::timestamptz, ${input.endAt}::timestamptz, '[)'),
           blocked_period = tstzrange(${input.startAt}::timestamptz, ${input.endAt}::timestamptz, '[)')
     WHERE id = ${booking.id}::uuid`;
  return booking;
}

/**
 * Weekly opening hours (§7.4). Hourly slot generation needs open windows — with
 * no rules a listing has NO bookable hourly slots (open-windows.ts). Daily mode
 * defaults to open when no rules exist, so this is only required for hourly.
 * Idempotent per listing.
 */
async function ensureWeeklyRules(
  tenantId: string,
  listingId: string,
  openTime = '08:00',
  closeTime = '20:00',
): Promise<void> {
  if (await prisma.availabilityRule.findFirst({ where: { listingId } })) return;
  await prisma.availabilityRule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      tenantId,
      listingId,
      dayOfWeek,
      openTime,
      closeTime,
    })),
  });
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
    requiresIdentityVerification?: boolean;
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
      requiresIdentityVerification: input.requiresIdentityVerification ?? false,
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
    photos?: string[];
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
      photos: (input.photos ?? []) as never,
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
