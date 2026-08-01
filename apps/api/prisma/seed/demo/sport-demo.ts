import argon2 from 'argon2';
import { PRICING_RULE_PRIORITY } from '@booking/contracts';
import { prisma } from '../client';
import { ensureRoleAssignment } from '../shared';
import { seedSportCatalog } from '../catalog/sport-catalog';
import { reconcileSeedPricingRules } from '../pricing-rules';
import type { TenantSetup } from '../tenants/booking-studio';

/** BookingStad DEMO data — the venue partner, 40 courts and peak-hour pricing. */
export async function seedSportDemo(setup: TenantSetup): Promise<void> {
  const stadTenant = setup.tenant;
  const stadCancelPolicy = { id: setup.cancellationPolicyId };
  const saleStartsAt = new Date();
  const saleEndsAt = new Date(saleStartsAt.getTime() + 14 * 24 * 60 * 60 * 1000);
  const password = await argon2.hash(process.env.SEED_DEMO_PASSWORD ?? 'demo-password', {
    type: argon2.argon2id,
  });
  const partnerOwnerRole = await prisma.role.findFirstOrThrow({
    where: { name: 'Partner Owner', scopeLevel: 'partner', isSystem: true },
  });

  const stadPartnerUser = await prisma.user.upsert({
    where: { email: 'hoang@sanhoanggia.vn' },
    update: {},
    create: {
      email: 'hoang@sanhoanggia.vn',
      passwordHash: password,
      fullName: 'Hoàng Gia Sport',
      phone: '0900000011',
      emailVerifiedAt: new Date(),
    },
  });
  const stadPartner = await prisma.partner.upsert({
    where: { tenantId_slug: { tenantId: stadTenant.id, slug: 'hoang-gia-sport' } },
    update: {},
    create: {
      tenantId: stadTenant.id,
      name: 'Hoàng Gia Sport',
      slug: 'hoang-gia-sport',
      description: 'Cụm sân thể thao đa môn tại Đà Nẵng và TP.HCM',
      partnerType: 'company',
      status: 'approved',
      verifiedAt: new Date(),
      businessInfo: { taxId: '0401234567' },
      contactInfo: {
        phone: '0900000011',
        provinceCode: '48',
        provinceName: 'Thành phố Đà Nẵng',
        provinceType: 'municipality',
        wardCode: '20263',
        wardName: 'Phường Sơn Trà',
        wardType: 'ward',
        address: '86 Hoàng Sa',
      },
      payoutInfo: {
        bank: 'Techcombank',
        accountNumber: '1902200011',
        holderName: 'CONG TY HOANG GIA SPORT',
      },
    },
  });
  await ensureRoleAssignment(
    stadPartnerUser.id,
    partnerOwnerRole.id,
    stadTenant.id,
    stadPartner.id,
  );
  if (
    !(await prisma.partnerMember.findFirst({
      where: { partnerId: stadPartner.id, userId: stadPartnerUser.id },
    }))
  ) {
    await prisma.partnerMember.create({
      data: { tenantId: stadTenant.id, partnerId: stadPartner.id, userId: stadPartnerUser.id },
    });
  }

  const { primaryCourtId } = await seedSportCatalog({
    types: setup.types,
    prisma,
    tenantId: stadTenant.id,
    partnerId: stadPartner.id,
    cancellationPolicyId: stadCancelPolicy.id,
  });

  // Peak-hour pricing (17:00–22:00): the hours everyone wants a pitch.
  await reconcileSeedPricingRules({
    tenantId: stadTenant.id,
    listingId: primaryCourtId,
    legacy: [
      {
        bookingMode: 'hourly',
        ruleType: 'time_range',
        params: { from: '17:00', to: '22:00' },
        price: '400000',
        priority: PRICING_RULE_PRIORITY.recurring,
      },
    ],
    desired: [
      {
        id: '0198cce1-6f0c-7000-8000-000000000003',
        bookingMode: 'hourly',
        ruleType: 'time_range',
        params: { days: [0, 6], from: '17:00', to: '22:00' },
        price: '400000',
        priority: PRICING_RULE_PRIORITY.recurring,
      },
      {
        id: '0198cce1-6f0c-7000-8000-000000000004',
        bookingMode: 'hourly',
        ruleType: 'time_range',
        params: { days: [1, 2, 3, 4, 5], from: '17:00', to: '22:00' },
        price: '400000',
        salePrice: '320000',
        saleStartsAt: saleStartsAt.toISOString(),
        saleEndsAt: saleEndsAt.toISOString(),
        campaignLabel: 'Ưu đãi sân tối',
        priority: PRICING_RULE_PRIORITY.recurring,
      },
    ],
  });
}
