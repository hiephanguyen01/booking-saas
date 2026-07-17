import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import {
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
} from '../src/modules/identity-access/domain/permission-catalog';
import { seedAdministrativeDivisions } from './seed-administrative-divisions';
import { removeLegacySeedListing, seedDemoCatalog } from './seed-demo-catalog';

/**
 * Seeds the permission catalog + system roles (idempotent), and in dev a
 * platform Super Admin account. Runs with the migration connection.
 */
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MIGRATE_DATABASE_URL } },
});

async function main() {
  await seedAdministrativeDivisions(prisma);

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
 * with service + inventory partners, six dynamic listing types, 120 complete
 * listings across five locations, mixed standalone/grouped Studios, commission
 * rules, and promotions. Idempotent — safe to re-run. Runs on the migrate
 * connection, which bypasses RLS, so cross-tenant inserts are allowed.
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
    create: {
      email: 'customer@studiohub.vn',
      passwordHash: password,
      fullName: 'Nguyen Van Khach',
    },
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
    update: {
      contactInfo: {
        phone: '0900000002',
        provinceCode: '79',
        provinceName: 'Thành phố Hồ Chí Minh',
        provinceType: 'municipality',
        wardCode: '26740',
        wardName: 'Phường Sài Gòn',
        wardType: 'ward',
        address: '12 Nguyễn Huệ',
      },
    },
    create: {
      tenantId: tenant.id,
      name: 'Giang Studio',
      slug: 'giang-studio',
      description: 'Studio chụp ảnh chuyên nghiệp tại Q1',
      partnerType: 'company',
      status: 'approved',
      verifiedAt: new Date(),
      businessInfo: { taxId: '0312345678' },
      contactInfo: {
        phone: '0900000002',
        provinceCode: '79',
        provinceName: 'Thành phố Hồ Chí Minh',
        provinceType: 'municipality',
        wardCode: '26740',
        wardName: 'Phường Sài Gòn',
        wardType: 'ward',
        address: '12 Nguyễn Huệ',
      },
      payoutInfo: {
        bank: 'Vietcombank',
        accountNumber: '0011223344',
        holderName: 'CONG TY GIANG STUDIO',
      },
    },
  });
  await ensureRoleAssignment(partnerUser.id, partnerOwnerRole.id, tenant.id, partner.id);
  if (
    !(await prisma.partnerMember.findFirst({
      where: { partnerId: partner.id, userId: partnerUser.id },
    }))
  ) {
    await prisma.partnerMember.create({
      data: { tenantId: tenant.id, partnerId: partner.id, userId: partnerUser.id },
    });
  }
  // Fee-schedule + terms acceptance recorded at approval (§7.2).
  for (const agreementType of ['partner_terms', 'commission_schedule'] as const) {
    if (
      !(await prisma.agreementAcceptance.findFirst({
        where: { partnerId: partner.id, agreementType },
      }))
    ) {
      await prisma.agreementAcceptance.create({
        data: {
          tenantId: tenant.id,
          partnerId: partner.id,
          userId: partnerUser.id,
          agreementType,
          version: '2026-01',
        },
      });
    }
  }
  // A pending individual partner — the approval-queue + identity-verification fixture.
  const applicantUser = await prisma.user.upsert({
    where: { email: 'trang@makeup.vn' },
    update: {},
    create: {
      email: 'trang@makeup.vn',
      passwordHash: password,
      fullName: 'Tran Thi Trang',
      phone: '0900000003',
    },
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
      payoutInfo: {
        bank: 'Techcombank',
        accountNumber: '9988776655',
        holderName: 'TRAN THI TRANG',
      },
      identityInfo: {
        documentType: 'national_id',
        documentNumber: '079196000123',
        holderName: 'TRAN THI TRANG',
      },
    },
  });
  await ensureRoleAssignment(applicantUser.id, partnerOwnerRole.id, tenant.id, pendingPartner.id);
  if (
    !(await prisma.partnerMember.findFirst({
      where: { partnerId: pendingPartner.id, userId: applicantUser.id },
    }))
  ) {
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

  // ── Cancellation policy + complete demo catalog ─────────────────────────────
  const cancelPolicy = await ensure(
    () =>
      prisma.cancellationPolicy.findFirst({ where: { tenantId: tenant.id, name: 'Linh hoạt' } }),
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
  // Make "Linh hoạt" the tenant-level fallback default (§11.3): any listing (or
  // partner) that sets no policy inherits it. It has partner_id null → tenant-level.
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { defaultCancellationPolicyId: cancelPolicy.id },
  });
  const {
    studioType,
    equipmentType,
    primaryStudio: studioA,
  } = await seedDemoCatalog({
    prisma,
    tenantId: tenant.id,
    servicePartnerId: partner.id,
    inventoryPartnerId: housePartner.id,
    cancellationPolicyId: cancelPolicy.id,
  });

  // ── Golden-hour pricing rule on Studio A (18:00–22:00 costs more) ───────────
  if (
    !(await prisma.pricingRule.findFirst({
      where: { listingId: studioA.id, ruleType: 'time_range' },
    }))
  ) {
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
    data: {
      settings: { ...(tenant.settings as Record<string, unknown>), partnerPromotionsEnabled: true },
    },
  });

  // An auto-applied campaign (no code) — off-peak Fri/Sat evenings on Studio listings.
  if (
    !(await prisma.promotion.findFirst({
      where: { tenantId: tenant.id, name: 'Giờ vàng cuối tuần' },
    }))
  ) {
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
  await prisma.partner.upsert({
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
  await upsertListingType(trialTenant.id, {
    name: 'Homestay',
    slug: 'homestay',
    allowedModes: ['daily'],
    defaultModes: ['daily'],
    unitLabel: 'đêm',
    sortOrder: 1,
    attributeSchema: [
      { key: 'bedrooms', label: 'Số phòng ngủ', type: 'number', filterable: true },
      {
        key: 'view',
        label: 'Hướng nhìn',
        type: 'select',
        filterable: true,
        options: ['Biển', 'Thành phố', 'Núi'],
      },
    ],
  });
  // The old Aperture homestay was part of the previous catalog fixture. The
  // requested replacement catalog lives entirely under StudioHub.
  await removeLegacySeedListing(prisma, trialTenant.id, 'villa-aperture-ven-bien');

  // ── Affiliate (§15) ─────────────────────────────────────────────────────────
  // An approved affiliate + a referral link so both dashboards render non-empty.
  // Commissions populate through the real booking flow (?ref=R-DEMO01 at checkout).
  const affiliateUser = await prisma.user.upsert({
    where: { email: 'affiliate@studiohub.vn' },
    update: {},
    create: {
      email: 'affiliate@studiohub.vn',
      passwordHash: password,
      fullName: 'Le Thi Cong Tac Vien',
    },
  });
  const affiliate = await prisma.affiliate.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: affiliateUser.id } },
    update: { status: 'approved' },
    create: {
      tenantId: tenant.id,
      userId: affiliateUser.id,
      status: 'approved',
      payoutInfo: {
        bankName: 'Vietcombank',
        accountNo: '0123456789',
        accountHolder: 'LE THI CONG TAC VIEN',
      },
    },
  });
  if (
    !(await prisma.referralLink.findFirst({ where: { tenantId: tenant.id, code: 'R-DEMO01' } }))
  ) {
    await prisma.referralLink.create({
      data: {
        tenantId: tenant.id,
        affiliateId: affiliate.id,
        code: 'R-DEMO01',
        target: 'tenant_home',
      },
    });
  }

  console.log(
    `Seeded demo tenant "${tenant.name}" (6 listing types, 120 listings across 5 locations, 5 studio groups, 10 photos per item, commission rules, WELCOME10) + themed tenant "Aperture Rentals" (trial expiring soon) + health fixtures (3 bookings, 1 overdue payout, 1 webhook failure) + an approved affiliate (affiliate@studiohub.vn) with referral link R-DEMO01.`,
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
    searchConfig?: unknown;
    requiresIdentityVerification?: boolean;
    structure?: 'standalone' | 'grouped' | 'flexible';
  },
) {
  return prisma.listingType.upsert({
    where: { tenantId_slug: { tenantId, slug: input.slug } },
    update: {
      name: input.name,
      structure: input.structure ?? 'standalone',
      allowedModes: input.allowedModes as never,
      defaultModes: input.defaultModes as never,
      unitLabel: input.unitLabel,
      sortOrder: input.sortOrder,
      attributeSchema: input.attributeSchema as never,
      searchConfig: (input.searchConfig ?? {}) as never,
      requiresIdentityVerification: input.requiresIdentityVerification ?? false,
    },
    create: {
      tenantId,
      name: input.name,
      slug: input.slug,
      structure: input.structure ?? 'standalone',
      allowedModes: input.allowedModes as never,
      defaultModes: input.defaultModes as never,
      unitLabel: input.unitLabel,
      sortOrder: input.sortOrder,
      attributeSchema: input.attributeSchema as never,
      searchConfig: (input.searchConfig ?? {}) as never,
      requiresIdentityVerification: input.requiresIdentityVerification ?? false,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
