import { randomBytes } from 'node:crypto';

const TRACEPARENT_MAX_LENGTH = 512;
const TRACESTATE_MAX_LENGTH = 512;
const ZERO_TRACE_ID = '0'.repeat(32);
const ZERO_SPAN_ID = '0'.repeat(16);
const LOWER_HEX_RE = /^[0-9a-f]+$/;
const SIMPLE_TRACESTATE_KEY_RE = /^[a-z][a-z0-9_*/-]{0,255}$/;
const MULTI_TENANT_TRACESTATE_KEY_RE =
  /^[a-z0-9][a-z0-9_*/-]{0,240}@[a-z][a-z0-9_*/-]{0,13}$/;
const SAMPLED_FLAG = 0x01;
const TRACE_RANDOMNESS_BITS = 56n;
const TRACE_RANDOMNESS_SPACE = 1n << TRACE_RANDOMNESS_BITS;
const SAMPLE_RATE_SCALE = 1_000_000n;

export interface StorefrontTraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags: string;
  tracestate?: string;
}

export type StorefrontSpanKind = 'server' | 'client';
export type StorefrontSpanStatus = 'ok' | 'error' | 'cancelled';

export interface StorefrontSpanRecord {
  name: string;
  kind: StorefrontSpanKind;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags: string;
  tracestate?: string;
  startedAt: string;
  durationMs: number;
  status: StorefrontSpanStatus;
  attributes?: Record<string, string | number | boolean>;
}

export interface StorefrontTraceExporter {
  export(span: StorefrontSpanRecord): void | Promise<void>;
  forceFlush?(): void | Promise<void>;
}

let exporter: StorefrontTraceExporter | null = null;
let rootSampleRate = 0;

/**
 * Vendor-neutral registration point. A runtime integration may register an
 * OpenTelemetry/Tempo/Jaeger adapter without importing that SDK into Storefront
 * request, route or business modules.
 */
export function registerStorefrontTraceExporter(next: StorefrontTraceExporter | null): void {
  exporter = next;
}

/** Configure the parent-based, trace-ID-ratio root sampling decision. */
export function configureStorefrontTraceSampling(sampleRate: number): void {
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    throw new RangeError('Storefront trace sample rate must be between 0 and 1');
  }
  rootSampleRate = sampleRate;
}

export function isStorefrontTraceSampled(traceFlags: string): boolean {
  const parsed = Number.parseInt(traceFlags, 16);
  return Number.isFinite(parsed) && (parsed & SAMPLED_FLAG) === SAMPLED_FLAG;
}

/** Export failures are isolated from the request path and never fail a response. */
export function exportStorefrontSpan(span: StorefrontSpanRecord): void {
  if (!exporter || !isStorefrontTraceSampled(span.traceFlags)) return;
  try {
    void Promise.resolve(exporter.export(span)).catch(logExporterFailure);
  } catch (error) {
    logExporterFailure(error);
  }
}

export async function forceFlushStorefrontTraceExporter(): Promise<void> {
  if (!exporter?.forceFlush) return;
  try {
    await exporter.forceFlush();
  } catch (error) {
    logExporterFailure(error);
  }
}

function logExporterFailure(error: unknown): void {
  const details =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { message: String(error) };
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'storefront',
      event: 'trace.export_failed',
      error: details,
    }),
  );
}

function randomNonZeroHex(bytes: number): string {
  const zero = '0'.repeat(bytes * 2);
  let value = zero;
  while (value === zero) value = randomBytes(bytes).toString('hex');
  return value;
}

function traceFlagsWithSampling(traceFlags: string, sampled: boolean): string {
  const parsed = Number.parseInt(traceFlags, 16) & 0xff;
  const next = sampled ? parsed | SAMPLED_FLAG : parsed & ~SAMPLED_FLAG;
  return next.toString(16).padStart(2, '0');
}

function shouldSampleRootTrace(traceId: string): boolean {
  if (rootSampleRate <= 0) return false;
  if (rootSampleRate >= 1) return true;

  // Use the trailing 56 trace-ID bits as a stable randomness source. A fixed
  // decimal scale avoids unsafe Number conversion of the 56-bit range.
  const randomness = BigInt(`0x${traceId.slice(-14)}`);
  const scaledRate = BigInt(Math.round(rootSampleRate * Number(SAMPLE_RATE_SCALE)));
  return randomness * SAMPLE_RATE_SCALE < TRACE_RANDOMNESS_SPACE * scaledRate;
}

function validTraceparent(value: string): {
  traceId: string;
  parentSpanId: string;
  traceFlags: string;
} | null {
  if (!value || value.length > TRACEPARENT_MAX_LENGTH || value !== value.trim()) return null;

  const parts = value.split('-');
  if (parts.length < 4) return null;
  const version = parts[0];
  const traceId = parts[1];
  const parentSpanId = parts[2];
  const traceFlags = parts[3];
  if (!version || !traceId || !parentSpanId || !traceFlags) return null;

  if (
    version.length !== 2 ||
    !LOWER_HEX_RE.test(version) ||
    version === 'ff' ||
    traceId.length !== 32 ||
    !LOWER_HEX_RE.test(traceId) ||
    traceId === ZERO_TRACE_ID ||
    parentSpanId.length !== 16 ||
    !LOWER_HEX_RE.test(parentSpanId) ||
    parentSpanId === ZERO_SPAN_ID ||
    traceFlags.length !== 2 ||
    !LOWER_HEX_RE.test(traceFlags)
  ) {
    return null;
  }

  const futureFields = parts.slice(4);
  // Version 00 has an exact four-field format. Future versions may append
  // fields, but empty extension fields are never accepted.
  if (version === '00' && futureFields.length > 0) return null;
  if (futureFields.some((field) => field.length === 0)) return null;

  return { traceId, parentSpanId, traceFlags };
}

function validTracestateValue(value: string): boolean {
  if (value.length === 0 || value.length > 256 || value.endsWith(' ')) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code > 0x7e || character === ',' || character === '=') return false;
  }
  return true;
}

function normalizeTracestate(value: string | null, hasValidTraceparent: boolean): string | undefined {
  if (!hasValidTraceparent || !value || value.length > TRACESTATE_MAX_LENGTH) return undefined;

  const members = value.split(',').map((member) => member.trim());
  if (members.length === 0 || members.length > 32 || members.some((member) => !member)) {
    return undefined;
  }

  const keys = new Set<string>();
  for (const member of members) {
    const separator = member.indexOf('=');
    if (separator <= 0) return undefined;
    const key = member.slice(0, separator);
    const memberValue = member.slice(separator + 1);
    const validKey =
      SIMPLE_TRACESTATE_KEY_RE.test(key) || MULTI_TENANT_TRACESTATE_KEY_RE.test(key);
    if (!validKey || !validTracestateValue(memberValue) || keys.has(key)) return undefined;
    keys.add(key);
  }

  return members.join(',');
}

/** Resolve an incoming remote parent or start a freshly sampled root trace. */
export function resolveStorefrontTraceContext(headers: Headers): StorefrontTraceContext {
  const parsed = validTraceparent(headers.get('traceparent') ?? '');
  const tracestate = normalizeTracestate(headers.get('tracestate'), Boolean(parsed));

  if (!parsed) {
    const traceId = randomNonZeroHex(16);
    return {
      traceId,
      spanId: randomNonZeroHex(8),
      traceFlags: traceFlagsWithSampling('00', shouldSampleRootTrace(traceId)),
    };
  }

  // Parent-based sampling preserves the upstream decision and guarantees all
  // Storefront and backend child spans in the trace stay coherent.
  return {
    traceId: parsed.traceId,
    spanId: randomNonZeroHex(8),
    parentSpanId: parsed.parentSpanId,
    traceFlags: parsed.traceFlags,
    ...(tracestate ? { tracestate } : {}),
  };
}

export function createStorefrontChildTraceContext(
  parent: StorefrontTraceContext,
): StorefrontTraceContext {
  return {
    traceId: parent.traceId,
    spanId: randomNonZeroHex(8),
    parentSpanId: parent.spanId,
    traceFlags: parent.traceFlags,
    ...(parent.tracestate ? { tracestate: parent.tracestate } : {}),
  };
}

export function storefrontTraceparent(context: StorefrontTraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.traceFlags}`;
}

export function storefrontTraceHeaders(
  context: StorefrontTraceContext,
): Record<string, string> {
  return {
    traceparent: storefrontTraceparent(context),
    ...(context.tracestate ? { tracestate: context.tracestate } : {}),
  };
}
