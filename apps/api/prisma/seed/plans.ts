import { prisma } from './client';

/**
 * Subscription plans are platform catalogue, not demo data: a tenant cannot hold
 * a subscription without one, so production seeds them too.
 */
export async function seedPlans() {
  const plan = {
    priceMonthly: 990_000n,
    limits: {
      maxPartners: 50,
      maxListings: 500,
      maxBookingsPerMonth: 5000,
      customDomain: true,
      affiliateModule: true,
    },
  };

  return prisma.subscriptionPlan.upsert({
    where: { name: 'Studio Pro' },
    update: plan,
    create: {
      name: 'Studio Pro',
      ...plan,
    },
  });
}
