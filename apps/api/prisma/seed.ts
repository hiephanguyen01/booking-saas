import '../src/config/load-root-env';
import { prisma } from './seed/client';
import { seedAdministrativeDivisions } from './seed/administrative-divisions';
import { seedTaxRates } from './seed/tax-rates';
import { seedWithholdingRates } from './seed/withholding-rates';
import { seedTaxThresholdRules } from './seed/tax-threshold-rules';
import { seedPlatform } from './seed/platform';
import { seedPlans } from './seed/plans';
import { seedScope } from './seed/scope';
import { seedBookingStudio } from './seed/tenants/booking-studio';
import { seedBookingStad } from './seed/tenants/booking-stad';
import { seedStudioDemo } from './seed/demo/studio-demo';
import { seedSportDemo } from './seed/demo/sport-demo';

/**
 * Seed entry point. Two scopes (see `seed/scope.ts`):
 *
 * - `SEED_SCOPE=tenants` — the PRODUCTION shape: permission catalogue, system
 *   roles, admin, subscription plans, and both tenants' settings (domains, theme,
 *   subscription, owner, cancellation policy, commission rules, listing types).
 *   No partners, listings, bookings or promotions. Requires SEED_OWNER_PASSWORD.
 * - default — everything above PLUS the dev/staging demo data.
 *
 * Idempotent in both scopes. Runs on the migrate connection, which bypasses RLS,
 * so cross-tenant inserts are allowed.
 */
async function main() {
  const scope = seedScope();
  await seedAdministrativeDivisions(prisma);
  await seedTaxRates(prisma);
  await seedWithholdingRates(prisma);
  await seedTaxThresholdRules(prisma);
  await seedPlatform();
  const plan = await seedPlans();

  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const studio = await seedBookingStudio({
    planId: plan.id,
    scope,
    createdAt: new Date(now - 45 * day),
  });
  const stad = await seedBookingStad({
    planId: plan.id,
    scope,
    createdAt: new Date(now - 20 * day),
    trialStartsAt: new Date(now - 9 * day),
    trialExpiresAt: new Date(now + 5 * day), // inside the board's 14-day expiry window
  });

  if (scope === 'tenants') {
    console.log(
      `Seeded settings only for "${studio.tenant.name}" and "${stad.tenant.name}" — no partners, listings or bookings.`,
    );
    return;
  }

  await seedStudioDemo(studio);
  await seedSportDemo(stad);
  console.log(
    `Seeded 2 demo tenants: "${studio.tenant.name}" (studio — 6 listing types, 121 listings, commission rules, WELCOME10, booking-history fixtures covering 5 UI states, 1 overdue payout, 1 webhook failure, affiliate affiliate@bookingstudio.vn / R-DEMO01) and "${stad.tenant.name}" (sport — 5 court types, 40 courts, peak-hour pricing, trial expiring soon).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
