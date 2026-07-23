import { z } from 'zod';

const rawEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    BACKEND_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),
    DASHBOARD_URL: z.string().url().optional(),
    SESSION_SECRET_CURRENT: z.string().min(32).optional(),
    SESSION_SECRET_PREVIOUS: z.string().min(32).optional(),
    SESSION_SECRET: z.string().min(32).optional(),
    SESSION_COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    ALLOW_MOCK_PAYMENTS: z.enum(['true', 'false']).optional(),
    PAYMENT_REDIRECT_ORIGINS: z.string().optional(),
    STORAGE_UPLOAD_ORIGINS: z.string().optional(),
  })
  .passthrough();

function invalidEnvironment(message: string): never {
  throw new Error(`Invalid Storefront environment: ${message}`);
}

const parsed = rawEnvironmentSchema.safeParse(process.env);
if (!parsed.success) {
  const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]
    .filter(Boolean)
    .join(', ');
  invalidEnvironment(fields ? `invalid values for ${fields}` : 'schema validation failed');
}

const raw = parsed.data;
const production = raw.NODE_ENV === 'production';

function requiredUrl(
  name: 'BACKEND_URL' | 'REDIS_URL' | 'DASHBOARD_URL',
  value: string | undefined,
  developmentFallback: string,
): URL {
  if (!value && production) invalidEnvironment(`${name} is required in production`);
  const url = new URL(value ?? developmentFallback);
  if (production && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    invalidEnvironment(`${name} cannot target a loopback host in production`);
  }
  return url;
}

function parseOrigins(
  name: 'PAYMENT_REDIRECT_ORIGINS' | 'STORAGE_UPLOAD_ORIGINS',
  value: string | undefined,
): Set<string> {
  const origins = new Set<string>();
  for (const item of value?.split(',') ?? []) {
    const candidate = item.trim();
    if (!candidate) continue;
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      invalidEnvironment(`${name} contains an invalid URL`);
    }
    if (url.origin !== candidate || url.username || url.password) {
      invalidEnvironment(`${name} entries must be bare origins`);
    }
    if (production && url.protocol !== 'https:') {
      invalidEnvironment(`${name} must use https in production`);
    }
    origins.add(url.origin);
  }
  if (production && origins.size === 0) {
    invalidEnvironment(`${name} must contain at least one origin in production`);
  }
  return origins;
}

const backendUrl = requiredUrl('BACKEND_URL', raw.BACKEND_URL, 'http://localhost:3000');
if (!['http:', 'https:'].includes(backendUrl.protocol)) {
  invalidEnvironment('BACKEND_URL must use http or https');
}

const redisUrl = requiredUrl('REDIS_URL', raw.REDIS_URL, 'redis://localhost:6379');
if (!['redis:', 'rediss:'].includes(redisUrl.protocol)) {
  invalidEnvironment('REDIS_URL must use redis or rediss');
}

const dashboardUrl = requiredUrl('DASHBOARD_URL', raw.DASHBOARD_URL, 'http://localhost:5174');
if (!['http:', 'https:'].includes(dashboardUrl.protocol)) {
  invalidEnvironment('DASHBOARD_URL must use http or https');
}

const currentSecret = raw.SESSION_SECRET_CURRENT ?? (!production ? raw.SESSION_SECRET : undefined);
if (!currentSecret) {
  invalidEnvironment('SESSION_SECRET_CURRENT must contain at least 32 characters');
}
if (production && currentSecret === 'dev-session-secret-change-me-min-32-chars-long') {
  invalidEnvironment('SESSION_SECRET_CURRENT cannot use the documented development value');
}

const secureCookies = raw.SESSION_COOKIE_SECURE
  ? raw.SESSION_COOKIE_SECURE === 'true'
  : production;
if (production && !secureCookies) {
  invalidEnvironment('SESSION_COOKIE_SECURE cannot be false in production');
}

const paymentRedirectOrigins = parseOrigins(
  'PAYMENT_REDIRECT_ORIGINS',
  raw.PAYMENT_REDIRECT_ORIGINS,
);
const storageUploadOrigins = parseOrigins(
  'STORAGE_UPLOAD_ORIGINS',
  raw.STORAGE_UPLOAD_ORIGINS ??
    (!production ? 'http://localhost:9000,http://127.0.0.1:9000' : undefined),
);

if (production && raw.ALLOW_MOCK_PAYMENTS === 'true') {
  invalidEnvironment('ALLOW_MOCK_PAYMENTS cannot be true in production');
}

export const storefrontEnv = Object.freeze({
  nodeEnv: raw.NODE_ENV,
  production,
  backendUrl: backendUrl.origin,
  redisUrl: redisUrl.toString(),
  dashboardUrl: dashboardUrl.origin,
  sessionSecrets: Object.freeze(
    [currentSecret, raw.SESSION_SECRET_PREVIOUS].filter((value): value is string => Boolean(value)),
  ),
  secureCookies,
  allowMockPayments: raw.ALLOW_MOCK_PAYMENTS === 'true',
  paymentRedirectOrigins,
  storageUploadOrigins,
});
