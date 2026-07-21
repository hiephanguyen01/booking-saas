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
    OTEL_SDK_DISABLED: z.string().optional(),
    OTEL_TRACES_EXPORTER: z.string().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().url().optional(),
    OTEL_EXPORTER_OTLP_PROTOCOL: z.string().optional(),
    OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: z.string().optional(),
    OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
    OTEL_EXPORTER_OTLP_TRACES_HEADERS: z.string().optional(),
    OTEL_EXPORTER_OTLP_TIMEOUT: z.string().optional(),
    OTEL_EXPORTER_OTLP_TRACES_TIMEOUT: z.string().optional(),
    OTEL_EXPORTER_OTLP_COMPRESSION: z.string().optional(),
    OTEL_EXPORTER_OTLP_TRACES_COMPRESSION: z.string().optional(),
    OTEL_SERVICE_NAME: z.string().optional(),
    OTEL_RESOURCE_ATTRIBUTES: z.string().optional(),
    OTEL_BSP_SCHEDULE_DELAY: z.string().optional(),
    OTEL_BSP_EXPORT_TIMEOUT: z.string().optional(),
    OTEL_BSP_MAX_QUEUE_SIZE: z.string().optional(),
    OTEL_BSP_MAX_EXPORT_BATCH_SIZE: z.string().optional(),
    STOREFRONT_TRACE_SAMPLE_RATE: z.string().optional(),
  })
  .passthrough();

const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const FORBIDDEN_OTLP_HEADERS = new Set([
  'accept',
  'connection',
  'content-encoding',
  'content-length',
  'content-type',
  'host',
  'traceparent',
  'tracestate',
  'user-agent',
  'x-request-id',
]);

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

function environmentBoolean(name: string, value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return invalidEnvironment(`${name} must be true or false`);
}

function environmentInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) invalidEnvironment(`${name} must be an integer`);
  const parsedValue = Number(value);
  if (!Number.isSafeInteger(parsedValue) || parsedValue < minimum || parsedValue > maximum) {
    invalidEnvironment(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsedValue;
}

function traceSampleRate(value: string | undefined): number {
  if (!value) return 1;
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 1) {
    invalidEnvironment('STOREFRONT_TRACE_SAMPLE_RATE must be between 0 and 1');
  }
  return parsedValue;
}

function validateOtlpEndpoint(name: string, value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    invalidEnvironment(`${name} must use http or https`);
  }
  if (url.username || url.password || url.hash) {
    invalidEnvironment(`${name} cannot contain credentials or a fragment`);
  }
  return url;
}

function resolveOtlpTracesEndpoint(): URL | undefined {
  if (raw.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
    return validateOtlpEndpoint(
      'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
      raw.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    );
  }
  if (!raw.OTEL_EXPORTER_OTLP_ENDPOINT) return undefined;

  const url = validateOtlpEndpoint('OTEL_EXPORTER_OTLP_ENDPOINT', raw.OTEL_EXPORTER_OTLP_ENDPOINT);
  const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  url.pathname = `${basePath}v1/traces`;
  return url;
}

function decodeListValue(name: string, value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return invalidEnvironment(`${name} contains invalid percent encoding`);
  }
}

function keyValueList(name: string, value: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawMember of value?.split(',') ?? []) {
    const member = rawMember.trim();
    if (!member) continue;
    const separator = member.indexOf('=');
    if (separator <= 0) invalidEnvironment(`${name} entries must use key=value`);
    const key = decodeListValue(name, member.slice(0, separator).trim());
    const memberValue = decodeListValue(name, member.slice(separator + 1).trim());
    if (!key || Object.hasOwn(result, key)) {
      invalidEnvironment(`${name} contains an empty or duplicate key`);
    }
    result[key] = memberValue;
  }
  return result;
}

function otlpHeaders(): Record<string, string> {
  const result = {
    ...keyValueList('OTEL_EXPORTER_OTLP_HEADERS', raw.OTEL_EXPORTER_OTLP_HEADERS),
    ...keyValueList(
      'OTEL_EXPORTER_OTLP_TRACES_HEADERS',
      raw.OTEL_EXPORTER_OTLP_TRACES_HEADERS,
    ),
  };
  for (const key of Object.keys(result)) {
    const normalized = key.toLowerCase();
    if (!HEADER_NAME_RE.test(key) || FORBIDDEN_OTLP_HEADERS.has(normalized)) {
      invalidEnvironment(`OTLP exporter header ${key} is not allowed`);
    }
  }
  return result;
}

function otlpCompression(): 'none' | 'gzip' {
  const value = (
    raw.OTEL_EXPORTER_OTLP_TRACES_COMPRESSION ??
    raw.OTEL_EXPORTER_OTLP_COMPRESSION ??
    'none'
  ).toLowerCase();
  if (value !== 'none' && value !== 'gzip') {
    invalidEnvironment('OTLP trace compression must be none or gzip');
  }
  return value;
}

function otlpProtocol(): 'http/json' {
  const value = (
    raw.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL ??
    raw.OTEL_EXPORTER_OTLP_PROTOCOL ??
    'http/json'
  ).toLowerCase();
  if (value !== 'http/json') {
    invalidEnvironment('Storefront tracing supports only the OTLP http/json protocol');
  }
  return value;
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

const paymentRedirectOrigins = new Set<string>();
for (const item of raw.PAYMENT_REDIRECT_ORIGINS?.split(',') ?? []) {
  const candidate = item.trim();
  if (!candidate) continue;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    invalidEnvironment('PAYMENT_REDIRECT_ORIGINS contains an invalid URL');
  }
  if (url.origin !== candidate || url.username || url.password) {
    invalidEnvironment('PAYMENT_REDIRECT_ORIGINS entries must be bare origins');
  }
  if (production && url.protocol !== 'https:') {
    invalidEnvironment('PAYMENT_REDIRECT_ORIGINS must use https in production');
  }
  paymentRedirectOrigins.add(url.origin);
}
if (production && paymentRedirectOrigins.size === 0) {
  invalidEnvironment('PAYMENT_REDIRECT_ORIGINS must contain at least one origin in production');
}
if (production && raw.ALLOW_MOCK_PAYMENTS === 'true') {
  invalidEnvironment('ALLOW_MOCK_PAYMENTS cannot be true in production');
}

const tracesExporter = (raw.OTEL_TRACES_EXPORTER ?? 'otlp').toLowerCase();
if (!['none', 'otlp'].includes(tracesExporter)) {
  invalidEnvironment('OTEL_TRACES_EXPORTER must be otlp or none');
}
const otlpEndpoint = resolveOtlpTracesEndpoint();
const tracingDisabled = environmentBoolean('OTEL_SDK_DISABLED', raw.OTEL_SDK_DISABLED);
const tracingEnabled = !tracingDisabled && tracesExporter === 'otlp' && Boolean(otlpEndpoint);
const maxQueueSize = environmentInteger(
  'OTEL_BSP_MAX_QUEUE_SIZE',
  raw.OTEL_BSP_MAX_QUEUE_SIZE,
  2048,
  1,
  100_000,
);
const maxExportBatchSize = environmentInteger(
  'OTEL_BSP_MAX_EXPORT_BATCH_SIZE',
  raw.OTEL_BSP_MAX_EXPORT_BATCH_SIZE,
  512,
  1,
  10_000,
);
if (maxExportBatchSize > maxQueueSize) {
  invalidEnvironment('OTEL_BSP_MAX_EXPORT_BATCH_SIZE cannot exceed OTEL_BSP_MAX_QUEUE_SIZE');
}
const resourceAttributes = keyValueList(
  'OTEL_RESOURCE_ATTRIBUTES',
  raw.OTEL_RESOURCE_ATTRIBUTES,
);
const serviceName = raw.OTEL_SERVICE_NAME?.trim() || resourceAttributes['service.name'] || 'booking-storefront';
if (serviceName.length > 255) invalidEnvironment('OTEL_SERVICE_NAME is too long');
const serviceVersion = resourceAttributes['service.version'] || '0.0.1';
resourceAttributes['deployment.environment.name'] ??= raw.NODE_ENV;

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
  tracing: Object.freeze({
    enabled: tracingEnabled,
    endpoint: otlpEndpoint,
    protocol: otlpProtocol(),
    headers: Object.freeze(otlpHeaders()),
    compression: otlpCompression(),
    timeoutMs: environmentInteger(
      'OTEL_EXPORTER_OTLP_TRACES_TIMEOUT',
      raw.OTEL_EXPORTER_OTLP_TRACES_TIMEOUT ?? raw.OTEL_EXPORTER_OTLP_TIMEOUT,
      10_000,
      1,
      120_000,
    ),
    scheduledDelayMs: environmentInteger(
      'OTEL_BSP_SCHEDULE_DELAY',
      raw.OTEL_BSP_SCHEDULE_DELAY,
      5_000,
      1,
      120_000,
    ),
    exportTimeoutMs: environmentInteger(
      'OTEL_BSP_EXPORT_TIMEOUT',
      raw.OTEL_BSP_EXPORT_TIMEOUT,
      30_000,
      1,
      300_000,
    ),
    maxQueueSize,
    maxExportBatchSize,
    sampleRate: traceSampleRate(raw.STOREFRONT_TRACE_SAMPLE_RATE),
    serviceName,
    serviceVersion,
    resourceAttributes: Object.freeze(resourceAttributes),
  }),
});
