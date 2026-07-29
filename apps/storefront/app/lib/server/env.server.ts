import { z } from 'zod';

/**
 * An empty env var means "not set".
 *
 * Deployment systems cannot omit a key conditionally — Docker Compose renders
 * `${SESSION_SECRET_PREVIOUS:-}` as a present-but-empty variable, and k8s/CI
 * behave the same. Without this, a blank `SESSION_SECRET_PREVIOUS=` in a deploy
 * env file fails `.min(32)` and the storefront refuses to boot, even though the
 * operator meant "I am not rotating right now".
 */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const rawEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    BACKEND_URL: optional(z.string().url()),
    REDIS_URL: optional(z.string().url()),
    DASHBOARD_URL: optional(z.string().url()),
    PLATFORM_BASE_DOMAIN: optional(z.string().trim().min(1)),
    SESSION_SECRET_CURRENT: optional(z.string().min(32)),
    SESSION_SECRET_PREVIOUS: optional(z.string().min(32)),
    SESSION_SECRET: optional(z.string().min(32)),
    SESSION_COOKIE_SECURE: optional(z.enum(['true', 'false'])),
    ALLOW_MOCK_PAYMENTS: optional(z.enum(['true', 'false'])),
    PAYMENT_REDIRECT_ORIGINS: optional(z.string()),
    STORAGE_UPLOAD_ORIGINS: optional(z.string()),
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

/** Every required URL is checked the same way, including its allowed protocols. */
function requiredUrl(
  name: 'BACKEND_URL' | 'REDIS_URL' | 'DASHBOARD_URL',
  value: string | undefined,
  developmentFallback: string,
  protocols: readonly string[],
): URL {
  if (!value && production) invalidEnvironment(`${name} is required in production`);
  const url = new URL(value ?? developmentFallback);
  if (!protocols.includes(url.protocol)) {
    invalidEnvironment(
      `${name} must use ${protocols.map((item) => item.replace(':', '')).join(' or ')}`,
    );
  }
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

const HTTP_PROTOCOLS = ['http:', 'https:'] as const;

const backendUrl = requiredUrl(
  'BACKEND_URL',
  raw.BACKEND_URL,
  'http://localhost:3000',
  HTTP_PROTOCOLS,
);
const redisUrl = requiredUrl('REDIS_URL', raw.REDIS_URL, 'redis://localhost:6379', [
  'redis:',
  'rediss:',
]);
const dashboardUrl = requiredUrl(
  'DASHBOARD_URL',
  raw.DASHBOARD_URL,
  'http://localhost:5174',
  HTTP_PROTOCOLS,
);

function requiredHostname(
  name: 'PLATFORM_BASE_DOMAIN',
  value: string | undefined,
  developmentFallback: string,
): string {
  if (!value && production) invalidEnvironment(`${name} is required in production`);
  const hostname = (value ?? developmentFallback).toLowerCase().replace(/\.$/, '');

  let parsedHostname: URL;
  try {
    parsedHostname = new URL(`http://${hostname}`);
  } catch {
    invalidEnvironment(`${name} must be a valid hostname`);
  }
  if (
    parsedHostname.hostname !== hostname ||
    parsedHostname.port ||
    parsedHostname.username ||
    parsedHostname.password ||
    parsedHostname.pathname !== '/'
  ) {
    invalidEnvironment(`${name} must be a bare hostname`);
  }

  return hostname;
}

const platformHostname = requiredHostname(
  'PLATFORM_BASE_DOMAIN',
  raw.PLATFORM_BASE_DOMAIN,
  'bookingos.vn',
);

const currentSecret = raw.SESSION_SECRET_CURRENT ?? (!production ? raw.SESSION_SECRET : undefined);
if (!currentSecret) {
  invalidEnvironment('SESSION_SECRET_CURRENT must contain at least 32 characters');
}
if (production && currentSecret === 'dev-session-secret-change-me-min-32-chars-long') {
  invalidEnvironment('SESSION_SECRET_CURRENT cannot use the documented development value');
}

const secureCookies = raw.SESSION_COOKIE_SECURE ? raw.SESSION_COOKIE_SECURE === 'true' : production;
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
  platformHostname,
  sessionSecrets: Object.freeze(
    [currentSecret, raw.SESSION_SECRET_PREVIOUS].filter((value): value is string => Boolean(value)),
  ),
  secureCookies,
  allowMockPayments: raw.ALLOW_MOCK_PAYMENTS === 'true',
  paymentRedirectOrigins,
  storageUploadOrigins,
});
