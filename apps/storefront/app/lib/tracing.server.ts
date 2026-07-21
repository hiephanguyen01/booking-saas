import { randomBytes } from 'node:crypto';

const TRACEPARENT_MAX_LENGTH = 512;
const TRACESTATE_MAX_LENGTH = 512;
const ZERO_TRACE_ID = '0'.repeat(32);
const ZERO_SPAN_ID = '0'.repeat(16);
const LOWER_HEX_RE = /^[0-9a-f]+$/;
const SIMPLE_TRACESTATE_KEY_RE = /^[a-z][a-z0-9_*\/-]{0,255}$/;
const MULTI_TENANT_TRACESTATE_KEY_RE =
  /^[a-z0-9][a-z0-9_*\/-]{0,240}@[a-z][a-z0-9_*\/-]{0,13}$/;

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
  startedAt: string;
  durationMs: number;
  status: StorefrontSpanStatus;
  attributes?: Record<string, string | number | boolean>;
}

export interface StorefrontTraceExporter {
  export(span: StorefrontSpanRecord): void | Promise<void>;
}

let exporter: StorefrontTraceExporter | null = null;

/**
 * Vendor-neutral registration point. A runtime integration may register an
 * OpenTelemetry/Tempo/Jaeger adapter without importing that SDK into Storefront
 * request, route or business modules.
 */
export function registerStorefrontTraceExporter(next: StorefrontTraceExporter | null): void {
  exporter = next;
}

/** Export failures are isolated from the request path and never fail a response. */
export function exportStorefrontSpan(span: StorefrontSpanRecord): void {
  if (!exporter) return;
  try {
    void Promise.resolve(exporter.export(span)).catch(logExporterFailure);
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

/** Resolve an incoming remote parent or start a fresh trace when it is invalid. */
export function resolveStorefrontTraceContext(headers: Headers): StorefrontTraceContext {
  const parsed = validTraceparent(headers.get('traceparent') ?? '');
  const tracestate = normalizeTracestate(headers.get('tracestate'), Boolean(parsed));

  if (!parsed) {
    return {
      traceId: randomNonZeroHex(16),
      spanId: randomNonZeroHex(8),
      traceFlags: '00',
    };
  }

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
