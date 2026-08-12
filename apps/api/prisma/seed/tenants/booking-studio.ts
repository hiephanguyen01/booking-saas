import argon2 from 'argon2';
import type { Locale, ThemeConfigInput } from '@booking/contracts';
import { prisma } from '../client';
import { ensure, ensureRoleAssignment } from '../shared';
import { seedStudioCatalogTypes, type CatalogTypes } from '../catalog/studio-catalog';
import {
  publishTenantLegalDocuments,
  seedTenantLegalDrafts,
  type PublishedLegalVersions,
} from '../legal';
import { ownerPassword, storagePublicUrl, type SeedScope } from '../scope';

export type TenantSetup = {
  tenant: { id: string; name: string; defaultLocale: string };
  owner: { id: string };
  cancellationPolicyId: string;
  types: CatalogTypes;
  /**
   * Published versionId per required doc type — `null` in `tenants` scope,
   * where the four documents are seeded as drafts only (see `../legal.ts`) and
   * there is nothing published yet for a demo seed to reference.
   */
  legalVersions: PublishedLegalVersions | null;
};

/**
 * BookingStudio — the studio-vertical tenant, SETTINGS ONLY.
 *
 * Everything here exists on production too: the tenant row, its domains, theme,
 * subscription, owner account, cancellation policy, commission rules and the
 * listing-type catalogue. Partners, listings and bookings live in
 * `seed/demo/studio-demo.ts` and are skipped when `SEED_SCOPE=tenants`.
 */
export async function seedBookingStudio(input: {
  planId: string;
  scope: SeedScope;
  createdAt: Date;
}): Promise<TenantSetup> {
  const publicUrl = storagePublicUrl();
  const carouselUrls = Array.from(
    { length: 4 },
    (_, index) =>
      `${publicUrl}/defaults/booking-studio/carousel/${String(index + 1).padStart(2, '0')}.jpg`,
  );
  const theme = {
    colors: { primary: '#E21114', accent: '#F97316', background: '#FFFFFF' },
    logoUrl: `${publicUrl}/defaults/booking-studio/logo.png`,
    faviconUrl: `${publicUrl}/defaults/booking-studio/app-icon.png`,
    pwaIcons: {
      icon180Url: `${publicUrl}/defaults/booking-studio/app-icon-180.png`,
      icon192Url: `${publicUrl}/defaults/booking-studio/app-icon-192.png`,
      icon512Url: `${publicUrl}/defaults/booking-studio/app-icon.png`,
    },
    font: 'Montserrat',
    hero: {
      title: 'Đặt studio trong 30 giây',
      subtitle: 'Không gian chuyên nghiệp cho mọi ý tưởng hình ảnh của bạn.',
      imageUrl: `${publicUrl}/defaults/booking-studio/background.png`,
    },
    carousel: carouselUrls,
    contact: {
      email: 'hello@bookingstudio.vn',
      phone: '0900 000 001',
      address: '12 Nguyễn Huệ, Phường Sài Gòn, Thành phố Hồ Chí Minh',
    },
    seo: {
      title: 'BookingStudio — Đặt studio chuyên nghiệp tại TP.HCM',
      description:
        'Khám phá và đặt studio chụp ảnh, thiết bị cùng dịch vụ sáng tạo chuyên nghiệp tại TP.HCM.',
    },
    socialLinks: {
      facebook: 'https://facebook.com/bookingstudio.vn',
      instagram: 'https://instagram.com/bookingstudio.vn',
      tiktok: 'https://tiktok.com/@bookingstudio.vn',
      youtube: 'https://youtube.com/@bookingstudio.vn',
    },
  } satisfies ThemeConfigInput;

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'bookingstudio' },
    update: {
      name: 'BookingStudio',
      status: 'active',
      vertical: 'studio',
      defaultTimezone: 'Asia/Ho_Chi_Minh',
      defaultLocale: 'vi',
      themeConfig: theme,
    },
    create: {
      name: 'BookingStudio',
      slug: 'bookingstudio',
      status: 'active',
      vertical: 'studio',
      defaultTimezone: 'Asia/Ho_Chi_Minh',
      defaultLocale: 'vi',
      createdAt: input.createdAt,
      themeConfig: theme,
    },
  });

  // Staging host is primary; the `.localhost` host rides along so ONE seed serves
  // both environments without an env switch. Bare `localhost`/`127.0.0.1` are
  // deliberately NOT mapped — the storefront serves the platform landing there.
  for (const [hostname, isPrimary, kind] of [
    ['bookingstudio.stg.bookingos.vn', true, 'storefront'],
    ['bookingstudio.localhost', false, 'storefront'],
    ['admin.bookingstudio.stg.bookingos.vn', true, 'dashboard'],
    ['admin.bookingstudio.localhost', false, 'dashboard'],
  ] as const) {
    await prisma.tenantDomain.upsert({
      where: { hostname },
      update: { kind },
      create: { tenantId: tenant.id, hostname, isPrimary, kind, verifiedAt: new Date() },
    });
  }

  if (!(await prisma.tenantSubscription.findFirst({ where: { tenantId: tenant.id } }))) {
    const now = new Date();
    await prisma.tenantSubscription.create({
      data: {
        tenantId: tenant.id,
        planId: input.planId,
        status: 'active',
        startsAt: now,
        expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
        note: 'Manual invoicing',
      },
    });
  }

  const owner = await prisma.user.upsert({
    where: { email: 'owner@bookingstudio.vn' },
    update: {},
    create: {
      email: 'owner@bookingstudio.vn',
      passwordHash: await argon2.hash(await ownerPassword(input.scope), { type: argon2.argon2id }),
      fullName: 'BookingStudio Owner',
      phone: '0900000001',
      emailVerifiedAt: new Date(),
    },
  });
  const tenantOwnerRole = await prisma.role.findFirstOrThrow({
    where: { name: 'Tenant Owner', scopeLevel: 'tenant', isSystem: true },
  });
  await ensureRoleAssignment(owner.id, tenantOwnerRole.id, tenant.id, null);

  // Tenant-level fallback policy (§11.3): any listing (or partner) that sets no
  // policy inherits it. `partner_id` null → tenant-level.
  const cancellationPolicy = await ensure(
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
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { defaultCancellationPolicyId: cancellationPolicy.id },
  });

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

  const types = await seedStudioCatalogTypes(prisma, tenant.id);

  // Every tenant starts dark with four drafts (§ tenant legal documents); only
  // the dev/staging demo publishes them so `pnpm dev` serves a live storefront.
  // `SEED_SCOPE=tenants` stops at drafts — a real owner must read and publish.
  await seedTenantLegalDrafts(tenant.id, tenant.name);
  const legalVersions =
    input.scope === 'full'
      ? await publishTenantLegalDocuments({
          tenantId: tenant.id,
          tenantName: tenant.name,
          defaultLocale: tenant.defaultLocale as Locale,
          publishedByUserId: owner.id,
        })
      : null;

  return { tenant, owner, cancellationPolicyId: cancellationPolicy.id, types, legalVersions };
}
