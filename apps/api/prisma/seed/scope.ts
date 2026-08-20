export type SeedScope = 'tenants' | 'full';

export type PlatformAdminCredentials = {
  email: string;
  password: string;
};

const DEFAULT_ADMIN_EMAIL = 'admin@bookingos.local';
const DEFAULT_ADMIN_PASSWORD = 'admin-dev-password';

/**
 * `SEED_SCOPE=tenants` seeds the platform catalogue and both tenants' SETTINGS
 * only — no partners, listings, bookings or promotions. That is the production
 * shape. Anything else (the default) also seeds the demo data for dev/staging.
 */
export function seedScope(): SeedScope {
  return process.env.SEED_SCOPE === 'tenants' ? 'tenants' : 'full';
}

/**
 * The seeded platform-admin credentials.
 *
 * Production-shaped seeds must never fall back to repository-public credentials.
 * Dev/staging preserve the existing defaults so `pnpm seed` remains one command.
 */
export function platformAdminCredentials(scope: SeedScope): PlatformAdminCredentials {
  const configuredEmail = process.env.SEED_ADMIN_EMAIL?.trim();
  const configuredPassword = process.env.SEED_ADMIN_PASSWORD;

  if (scope === 'tenants') {
    if (!configuredEmail) {
      throw new Error(
        'SEED_ADMIN_EMAIL is required when SEED_SCOPE=tenants — refusing to seed a production Super Admin with the shared development email.',
      );
    }
    if (!configuredPassword?.trim()) {
      throw new Error(
        'SEED_ADMIN_PASSWORD is required when SEED_SCOPE=tenants — refusing to seed a production Super Admin with the shared development password.',
      );
    }
    if (configuredEmail.toLowerCase() === DEFAULT_ADMIN_EMAIL) {
      throw new Error(
        `SEED_ADMIN_EMAIL must not use the shared development account ${DEFAULT_ADMIN_EMAIL} when SEED_SCOPE=tenants.`,
      );
    }
    if (configuredPassword === DEFAULT_ADMIN_PASSWORD) {
      throw new Error(
        'SEED_ADMIN_PASSWORD must not use the shared development password when SEED_SCOPE=tenants.',
      );
    }
  }

  return {
    email: configuredEmail || DEFAULT_ADMIN_EMAIL,
    password: configuredPassword || DEFAULT_ADMIN_PASSWORD,
  };
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
