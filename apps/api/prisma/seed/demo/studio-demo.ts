import argon2 from 'argon2';
import { prisma } from '../client';
import { bookingHistory, ensure, ensureRoleAssignment, seedBooking } from '../shared';
import { seedDemoCatalog } from '../catalog/studio-catalog';
import { percentOfBps } from '../../../src/shared/money/money';
import { addMinutes, wallClockInZone, zonedTimeToUtc } from '../../../src/shared/time/time';
import type { TenantSetup } from '../tenants/booking-studio';

/**
 * BookingStudio DEMO data — partners, 121 listings, promotions, the platform-health
 * fixtures and the affiliate. Never runs when SEED_SCOPE=tenants.
 */
export async function seedStudioDemo(setup: TenantSetup): Promise<void> {
  const tenant = setup.tenant;
  const owner = setup.owner;
  const cancelPolicy = { id: setup.cancellationPolicyId };
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
  const demoTimezone = 'Asia/Ho_Chi_Minh';
  const atLocalHour = (date: Date, hour: number): Date => {
    const wall = wallClockInZone(date, demoTimezone);
    return zonedTimeToUtc(
      { year: wall.year, month: wall.month, day: wall.day, hour, minute: 0 },
      demoTimezone,
    );
  };

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
    where: { email: 'customer@bookingstudio.vn' },
    update: {},
    create: {
      email: 'customer@bookingstudio.vn',
      passwordHash: password,
      fullName: 'Nguyen Van Khach',
    },
  });
  const partnerOwnerRole = await prisma.role.findFirstOrThrow({
    where: { name: 'Partner Owner', scopeLevel: 'partner', isSystem: true },
  });
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
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'bookingstudio-house' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'BookingStudio House',
      slug: 'bookingstudio-house',
      partnerType: 'company',
      isHouse: true,
      status: 'approved',
    },
  });

  const {
    studioType,
    equipmentType,
    primaryStudio: studioA,
  } = await seedDemoCatalog({
    types: setup.types,
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
  // ── A basic promo code ───────────────────────────────────────────────────────
  await prisma.promotion.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'WELCOME10' } },
    update: { storefrontVisible: true },
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
      storefrontVisible: true,
      status: 'active',
      startsAt: new Date(),
    },
  });

  // ── Advanced promotions (Phase 2, §12) ───────────────────────────────────────
  // Let partners create their own codes on this tenant (the per-tenant toggle).
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      settings: {
        ...(((
          await prisma.tenant.findUniqueOrThrow({
            where: { id: tenant.id },
            select: { settings: true },
          })
        ).settings ?? {}) as Record<string, unknown>),
        partnerPromotionsEnabled: true,
      },
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
    update: { storefrontVisible: true },
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
      storefrontVisible: true,
      status: 'active',
      startsAt: new Date(),
    },
  });

  // ── Platform-health fixtures (Task 1.12 admin board) ────────────────────────
  // Without realized bookings/payouts/failures the health board renders all
  // zeros. Seed a small, idempotent scenario so GMV, gmv30d, bookings30d,
  // time-to-first-booking, overdue payouts, webhook failures and the
  // expiring-subscription queue are all demonstrably non-empty.
  const healthBooking1CreatedAt = daysAgo(40);
  const healthBooking1StartAt = atLocalHour(daysAgo(39), 9);
  const healthBooking1EndAt = atLocalHour(daysAgo(39), 11);
  const reviewedBooking = await seedBooking({
    tenantId: tenant.id,
    listingId: studioA.id,
    partnerId: partner.id,
    resourceId: studioA.resourceId,
    customerId: customer.id,
    cancellationPolicyId: cancelPolicy.id,
    code: 'BK-HEALTH01',
    idempotencyKey: 'seed-health-booking-1',
    status: 'completed',
    finalAmount: 700_000n,
    paidAmount: 700_000n,
    customerNote: 'Dữ liệu demo sức khỏe nền tảng.',
    createdAt: healthBooking1CreatedAt, // first realized booking → sets time-to-first-booking
    startAt: healthBooking1StartAt,
    endAt: healthBooking1EndAt,
    history: bookingHistory(
      healthBooking1CreatedAt,
      healthBooking1StartAt,
      healthBooking1EndAt,
      'completed',
    ),
  });
  const healthBooking2CreatedAt = daysAgo(12);
  const healthBooking2StartAt = atLocalHour(daysFromNow(30), 14);
  const healthBooking2EndAt = atLocalHour(daysFromNow(30), 16);
  await seedBooking({
    tenantId: tenant.id,
    listingId: studioA.id,
    partnerId: partner.id,
    resourceId: studioA.resourceId,
    customerId: customer.id,
    cancellationPolicyId: cancelPolicy.id,
    code: 'BK-HEALTH02',
    idempotencyKey: 'seed-health-booking-2',
    status: 'confirmed', // upcoming → constrained by the GiST exclusion (future slot)
    finalAmount: 500_000n,
    paidAmount: 500_000n,
    customerNote: 'Dữ liệu demo sức khỏe nền tảng.',
    createdAt: healthBooking2CreatedAt,
    startAt: healthBooking2StartAt,
    endAt: healthBooking2EndAt,
    history: bookingHistory(
      healthBooking2CreatedAt,
      healthBooking2StartAt,
      healthBooking2EndAt,
      'confirmed',
    ),
  });
  const healthBooking3CreatedAt = daysAgo(4);
  const healthBooking3StartAt = atLocalHour(daysAgo(3), 10);
  const healthBooking3EndAt = atLocalHour(daysAgo(3), 14);
  await seedBooking({
    tenantId: tenant.id,
    listingId: studioA.id,
    partnerId: partner.id,
    resourceId: studioA.resourceId,
    customerId: customer.id,
    cancellationPolicyId: cancelPolicy.id,
    code: 'BK-HEALTH03',
    idempotencyKey: 'seed-health-booking-3',
    status: 'completed',
    finalAmount: 1_800_000n,
    paidAmount: 1_800_000n,
    customerNote: 'Dữ liệu demo sức khỏe nền tảng.',
    createdAt: healthBooking3CreatedAt,
    startAt: healthBooking3StartAt,
    endAt: healthBooking3EndAt,
    history: bookingHistory(
      healthBooking3CreatedAt,
      healthBooking3StartAt,
      healthBooking3EndAt,
      'completed',
    ),
  });

  const pendingPaymentCreatedAt = daysAgo(1);
  const pendingPaymentStartAt = atLocalHour(daysFromNow(31), 9);
  const pendingPaymentEndAt = atLocalHour(daysFromNow(31), 11);
  await seedBooking({
    tenantId: tenant.id,
    listingId: studioA.id,
    partnerId: partner.id,
    resourceId: studioA.resourceId,
    customerId: customer.id,
    cancellationPolicyId: cancelPolicy.id,
    code: 'BK-DEMO-PAY',
    idempotencyKey: 'seed-demo-booking-payment',
    status: 'pending_payment',
    finalAmount: 900_000n,
    paidAmount: 0n,
    expiresAt: daysFromNow(1),
    customerNote: 'Chờ thanh toán để xác nhận lịch chụp sản phẩm.',
    createdAt: pendingPaymentCreatedAt,
    startAt: pendingPaymentStartAt,
    endAt: pendingPaymentEndAt,
    history: bookingHistory(
      pendingPaymentCreatedAt,
      pendingPaymentStartAt,
      pendingPaymentEndAt,
      'pending_payment',
    ),
  });

  const cancelledCreatedAt = daysAgo(10);
  const cancelledStartAt = atLocalHour(daysFromNow(12), 13);
  const cancelledEndAt = atLocalHour(daysFromNow(12), 15);
  await seedBooking({
    tenantId: tenant.id,
    listingId: studioA.id,
    partnerId: partner.id,
    resourceId: studioA.resourceId,
    customerId: customer.id,
    cancellationPolicyId: cancelPolicy.id,
    code: 'BK-DEMO-CANCEL',
    idempotencyKey: 'seed-demo-booking-cancelled',
    status: 'cancelled',
    finalAmount: 1_200_000n,
    paidAmount: 600_000n,
    refundDueAmount: 600_000n,
    refundPercent: 100,
    customerNote: 'Khách hàng hủy lịch và đang chờ hoàn tiền đặt cọc.',
    createdAt: cancelledCreatedAt,
    startAt: cancelledStartAt,
    endAt: cancelledEndAt,
    history: bookingHistory(cancelledCreatedAt, cancelledStartAt, cancelledEndAt, 'cancelled'),
  });

  const noShowCreatedAt = daysAgo(5);
  const noShowStartAt = atLocalHour(daysAgo(2), 10);
  const noShowEndAt = atLocalHour(daysAgo(2), 12);
  await seedBooking({
    tenantId: tenant.id,
    listingId: studioA.id,
    partnerId: partner.id,
    resourceId: studioA.resourceId,
    customerId: customer.id,
    cancellationPolicyId: cancelPolicy.id,
    code: 'BK-DEMO-NOSHOW',
    idempotencyKey: 'seed-demo-booking-no-show',
    status: 'no_show',
    finalAmount: 750_000n,
    paidAmount: 750_000n,
    customerNote: 'Khách hàng không đến studio trong khung giờ đã đặt.',
    createdAt: noShowCreatedAt,
    startAt: noShowStartAt,
    endAt: noShowEndAt,
    history: bookingHistory(noShowCreatedAt, noShowStartAt, noShowEndAt, 'no_show'),
  });

  const demoReviewCreatedAt = addMinutes(healthBooking1EndAt, 60);
  const demoReview = await prisma.review.upsert({
    where: { bookingId: reviewedBooking.id },
    update: { createdAt: demoReviewCreatedAt },
    create: {
      tenantId: tenant.id,
      bookingId: reviewedBooking.id,
      listingId: studioA.id,
      groupId: studioA.groupId,
      partnerId: partner.id,
      customerId: customer.id,
      rating: 5,
      content:
        'Không gian đúng như hình, thiết bị sạch và nhân viên hỗ trợ set up rất nhanh. Mình sẽ quay lại cho buổi chụp tiếp theo.',
      createdAt: demoReviewCreatedAt,
    },
  });
  const demoReviewReplyCreatedAt = addMinutes(demoReviewCreatedAt, 60);
  await prisma.reviewReply.upsert({
    where: { reviewId: demoReview.id },
    update: { createdAt: demoReviewReplyCreatedAt },
    create: {
      tenantId: tenant.id,
      reviewId: demoReview.id,
      partnerId: partner.id,
      authorUserId: partnerUser.id,
      content:
        'Cảm ơn bạn đã tin tưởng Giang Studio. Đội ngũ rất vui khi buổi chụp diễn ra thuận lợi và mong sớm được đón bạn trở lại.',
      createdAt: demoReviewReplyCreatedAt,
    },
  });
  await prisma.listing.update({
    where: { id: studioA.id },
    data: { ratingAvg: 5, reviewCount: 1 },
  });
  if (studioA.groupId) {
    await prisma.listingGroup.update({
      where: { id: studioA.groupId },
      data: { ratingAvg: 5, reviewCount: 1 },
    });
  }

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

  // ── Affiliate (§15) ─────────────────────────────────────────────────────────
  // An approved affiliate + a referral link so both dashboards render non-empty.
  // Commissions populate through the real booking flow (?ref=R-DEMO01 at checkout).
  const affiliateUser = await prisma.user.upsert({
    where: { email: 'affiliate@bookingstudio.vn' },
    update: {},
    create: {
      email: 'affiliate@bookingstudio.vn',
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
}
