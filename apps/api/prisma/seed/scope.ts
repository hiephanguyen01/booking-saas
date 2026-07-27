export type SeedScope = 'tenants' | 'full';

/**
 * `SEED_SCOPE=tenants` seeds the platform catalogue and both tenants' SETTINGS
 * only — no partners, listings, bookings or promotions. That is the production
 * shape. Anything else (the default) also seeds the demo data for dev/staging.
 */
export function seedScope(): SeedScope {
  return process.env.SEED_SCOPE === 'tenants' ? 'tenants' : 'full';
}

/**
 * The seeded tenant-owner password.
 *
 * In `tenants` scope this is a REAL account on a real environment, so a shared
 * default would be a known-password login on production: `SEED_OWNER_PASSWORD`
 * is required and the seed fails loudly without it. Dev/staging fall back to the
 * usual demo password so `pnpm seed` stays one command.
 */
export async function ownerPassword(scope: SeedScope): Promise<string> {
  const configured = process.env.SEED_OWNER_PASSWORD;
  if (configured) return configured;
  if (scope === 'tenants') {
    throw new Error(
      'SEED_OWNER_PASSWORD is required when SEED_SCOPE=tenants — refusing to seed a tenant owner with the shared demo password.',
    );
  }
  return process.env.SEED_DEMO_PASSWORD ?? 'demo-password';
}

/** MinIO/S3 public base for seeded theme assets, without a trailing slash. */
export function storagePublicUrl(): string {
  return (process.env.S3_PUBLIC_URL ?? 'http://localhost:9000/bookingos').replace(/\/$/, '');
}
