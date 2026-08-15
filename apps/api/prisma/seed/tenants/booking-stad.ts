import argon2 from 'argon2';
import type { Locale, ThemeConfigInput } from '@booking/contracts';
import { prisma } from '../client';
import { ensure, ensureRoleAssignment } from '../shared';
import { seedSportCatalogTypes } from '../catalog/sport-catalog';
import { publishTenantLegalDocuments, seedTenantLegalDrafts } from '../legal';
import { ownerPassword, type SeedScope } from '../scope';
import type { TenantSetup } from './studiohub';

/**
 * BookingStad — the sport-vertical tenant, SETTINGS ONLY.
 *
 * Second tenant with its own vertical, theme and domain, so the storefront
 * journey is provably multi-tenant (DoD 1.15). Its subscription is a trial about
 * to lapse, which is what fills the admin board's "expiring soon" queue —
 * `trial` is a BILLABLE status, so every partner/booking flow still works.
 *
 * Courts and their partner live in `seed/demo/sport-demo.ts`.
 */
export async function seedBookingStad(input: {
  planId: string;
  scope: SeedScope;
  createdAt: Date;
  trialStartsAt: Date;
  trialExpiresAt: Date;
}): Promise<TenantSetup> {
  const theme = {
    colors: { primary: '#16A34A', accent: '#F59E0B', background: '#FFFFFF' },
    font: 'Montserrat',
    hero: {
      title: 'Đặt sân trong 30 giây',
      subtitle: 'Bóng đá, bóng rổ, tennis, cầu lông, pickleball — sân trống theo giờ, đặt là chơi.',
    },
    contact: {
      email: 'hello@bookingstad.vn',
      phone: '0900 000 010',
      address: '86 Hoàng Sa, Phường Sơn Trà, Thành phố Đà Nẵng',
    },
    seo: {
      title: 'BookingStad — Đặt sân thể thao theo giờ',
      description:
        'Tìm và đặt sân bóng đá, bóng rổ, tennis, cầu lông, pickleball theo giờ trên toàn quốc.',
    },
  } satisfies ThemeConfigInput;

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'bookingstad' },
    update: {
      name: 'BookingStad',
      status: 'active',
      vertical: 'sport',
      defaultTimezone: 'Asia/Ho_Chi_Minh',
      defaultLocale: 'vi',
      themeConfig: theme,
    },
    create: {
      name: 'BookingStad',
      slug: 'bookingstad',
      status: 'active',
      vertical: 'sport',
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
    ['bookingstad.stg.bookingos.vn', true, 'storefront'],
    ['bookingstad.localhost', false, 'storefront'],
    ['admin.bookingstad.stg.bookingos.vn', true, 'dashboard'],
    ['admin.bookingstad.localhost', false, 'dashboard'],
  ] as const) {
    await prisma.tenantDomain.upsert({
      where: { hostname },
      update: { kind },
      create: { tenantId: tenant.id, hostname, isPrimary, kind, verifiedAt: new Date() },
    });
  }

  if (!(await prisma.tenantSubscription.findFirst({ where: { tenantId: tenant.id } }))) {
    await prisma.tenantSubscription.create({
      data: {
        tenantId: tenant.id,
        planId: input.planId,
        status: 'trial',
        startsAt: input.trialStartsAt,
        expiresAt: input.trialExpiresAt,
        note: 'Trial expiring soon',
      },
    });
  }

  // BookingStad gets its OWN owner — never reuse StudioHub's, or that account
  // would belong to two tenants and the dashboard (one tenant scope per session)
  // would resolve the wrong one.
  const owner = await prisma.user.upsert({
    where: { email: 'owner@bookingstad.vn' },
    update: {},
    create: {
      email: 'owner@bookingstad.vn',
      passwordHash: await argon2.hash(await ownerPassword(input.scope), { type: argon2.argon2id }),
      fullName: 'BookingStad Owner',
      phone: '0900000010',
      emailVerifiedAt: new Date(),
    },
  });
  const tenantOwnerRole = await prisma.role.findFirstOrThrow({
    where: { name: 'Tenant Owner', scopeLevel: 'tenant', isSystem: true },
  });
  await prisma.roleAssignment.deleteMany({
    where: { tenantId: tenant.id, roleId: tenantOwnerRole.id, NOT: { userId: owner.id } },
  });
  await ensureRoleAssignment(owner.id, tenantOwnerRole.id, tenant.id, null);

  const cancellationPolicy = await ensure(
    () =>
      prisma.cancellationPolicy.findFirst({
        where: { tenantId: tenant.id, name: 'Huỷ trước 24h' },
      }),
    () =>
      prisma.cancellationPolicy.create({
        data: {
          tenantId: tenant.id,
          name: 'Huỷ trước 24h',
          rules: [
            { hoursBefore: 24, refundPercent: 100 },
            { hoursBefore: 4, refundPercent: 50 },
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
          tenantRate: 12n,
          platformRate: 2,
          affiliateRateType: 'percent',
          affiliateRate: 4n,
          effectiveFrom: new Date(),
        },
      }),
  );

  const types = await seedSportCatalogTypes(prisma, tenant.id);

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
