import { gzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import type {
  StorefrontSpanRecord,
  StorefrontTraceExporter,
} from './tracing.server';

const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);
const MAX_EXPORT_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 30_000;

type ExporterLogLevel = 'info' | 'warn' | 'error';
type OtlpAttributeValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number };

export interface OtlpHttpTraceExporterOptions {
  endpoint: URL;
  headers: Readonly<Record<string, string>>;
  compression: 'none' | 'gzip';
  timeoutMs: number;
  scheduledDelayMs: number;
  maxQueueSize: number;
  maxExportBatchSize: number;
  serviceName: string;
  serviceVersion: string;
  resourceAttributes: Readonly<Record<string, string>>;
}

interface ExportAttemptResult {
  accepted: boolean;
  retryable: boolean;
  retryAfterMs?: number;
  statusCode?: number;
}

function exporterLog(
  level: ExporterLogLevel,
  event: string,
  details: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'storefront',
    event,
    ...details,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

function attributeValue(value: string | number | boolean): OtlpAttributeValue {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  if (Number.isSafeInteger(value)) return { intValue: String(value) };
  return { doubleValue: value };
}

function attributes(values: Readonly<Record<string, string | number | boolean>>) {
  return Object.entries(values).map(([key, value]) => ({
    key,
    value: attributeValue(value),
  }));
}

function unixNanoRange(span: StorefrontSpanRecord): {
  startTimeUnixNano: string;
  endTimeUnixNano: string;
} {
  const parsedStartMs = Date.parse(span.startedAt);
  const startMs = Number.isFinite(parsedStartMs) ? parsedStartMs : Date.now();
  const safeDurationMs = Number.isFinite(span.durationMs) ? Math.max(0, span.durationMs) : 0;
  const startTimeUnixNano = BigInt(Math.trunc(startMs)) * 1_000_000n;
  const durationNano = BigInt(Math.round(safeDurationMs * 1_000_000));
  return {
    startTimeUnixNano: startTimeUnixNano.toString(),
    endTimeUnixNano: (startTimeUnixNano + durationNano).toString(),
  };
}

function otlpSpan(span: StorefrontSpanRecord) {
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
    ...(span.tracestate ? { traceState: span.tracestate } : {}),
    flags: Number.parseInt(span.traceFlags, 16) & 0xff,
    name: span.name,
    kind: span.kind === 'server' ? 2 : 3,
    ...unixNanoRange(span),
    attributes: attributes(span.attributes ?? {}),
    status: {
      code: span.status === 'ok' ? 1 : 2,
      ...(span.status === 'cancelled' ? { message: 'cancelled' } : {}),
    },
  };
}

function exportPayload(
  spans: readonly StorefrontSpanRecord[],
  options: OtlpHttpTraceExporterOptions,
) {
  const resourceAttributes = {
    'service.name': options.serviceName,
    'service.version': options.serviceVersion,
    'telemetry.sdk.language': 'nodejs',
    'telemetry.sdk.name': 'booking-storefront-native',
    ...options.resourceAttributes,
  };

  return {
    resourceSpans: [
      {
        resource: { attributes: attributes(resourceAttributes) },
        scopeSpans: [
          {
            scope: {
              name: '@booking/storefront',
              version: options.serviceVersion,
            },
            spans: spans.map(otlpSpan),
          },
        ],
      },
    ],
  };
}

function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.round(seconds * 1_000));
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, date - Date.now()));
}

function retryDelayMilliseconds(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  const exponential = Math.min(MAX_RETRY_DELAY_MS, 500 * 2 ** Math.max(0, attempt - 1));
  return exponential + Math.floor(Math.random() * 250);
}

export class OtlpHttpTraceExporter implements StorefrontTraceExporter {
  readonly #options: OtlpHttpTraceExporterOptions;
  readonly #queue: StorefrontSpanRecord[] = [];
  #timer: ReturnType<typeof setTimeout> | null = null;
  #inFlight: Promise<void> | null = null;
  #droppedSpans = 0;
  #lastDropLogAt = 0;

  constructor(options: OtlpHttpTraceExporterOptions) {
    this.#options = options;
  }

  export(span: StorefrontSpanRecord): void {
    if (this.#queue.length >= this.#options.maxQueueSize) {
      this.#droppedSpans += 1;
      this.#logDroppedSpans();
      return;
    }

    this.#queue.push(span);
    if (this.#queue.length >= this.#options.maxExportBatchSize) {
      void this.#flush();
    } else {
      this.#scheduleFlush();
    }
  }

  async forceFlush(): Promise<void> {
    while (this.#queue.length > 0 || this.#inFlight) {
      if (this.#inFlight) await this.#inFlight;
      else await this.#flush();
    }
  }

  #scheduleFlush(): void {
    if (this.#timer || this.#inFlight || this.#queue.length === 0) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#flush();
    }, this.#options.scheduledDelayMs);
    this.#timer.unref?.();
  }

  #clearTimer(): void {
    if (!this.#timer) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  #flush(): Promise<void> {
    if (this.#inFlight) return this.#inFlight;
    this.#clearTimer();
    const batch = this.#queue.splice(0, this.#options.maxExportBatchSize);
    if (batch.length === 0) return Promise.resolve();

    const operation = this.#sendWithRetry(batch).finally(() => {
      this.#inFlight = null;
      if (this.#queue.length >= this.#options.maxExportBatchSize) void this.#flush();
      else this.#scheduleFlush();
    });
    this.#inFlight = operation;
    return operation;
  }

  async #sendWithRetry(batch: readonly StorefrontSpanRecord[]): Promise<void> {
    let lastResult: ExportAttemptResult | undefined;

    for (let attempt = 1; attempt <= MAX_EXPORT_ATTEMPTS; attempt += 1) {
      lastResult = await this.#sendBatch(batch);
      if (lastResult.accepted) return;
      if (!lastResult.retryable || attempt === MAX_EXPORT_ATTEMPTS) break;
      await delay(retryDelayMilliseconds(attempt, lastResult.retryAfterMs));
    }

    exporterLog('error', 'trace.batch_export_failed', {
      batchSize: batch.length,
      attempts: MAX_EXPORT_ATTEMPTS,
      ...(lastResult?.statusCode ? { statusCode: lastResult.statusCode } : {}),
      retryable: lastResult?.retryable ?? true,
    });
  }

  async #sendBatch(batch: readonly StorefrontSpanRecord[]): Promise<ExportAttemptResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#options.timeoutMs);
    timeout.unref?.();

    try {
      const json = JSON.stringify(exportPayload(batch, this.#options));
      const compressed = this.#options.compression === 'gzip';
      const body = compressed ? gzipSync(json) : json;
      const headers = new Headers(this.#options.headers);
      headers.set('content-type', 'application/json');
      headers.set('accept', 'application/json');
      headers.set('user-agent', `booking-storefront-otlp/${this.#options.serviceVersion}`);
      if (compressed) headers.set('content-encoding', 'gzip');

      const response = await fetch(this.#options.endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      await response.arrayBuffer().catch(() => undefined);

      if (response.status === 200) return { accepted: true, retryable: false };
      return {
        accepted: false,
        retryable: RETRYABLE_STATUS_CODES.has(response.status),
        retryAfterMs: retryAfterMilliseconds(response.headers.get('retry-after')),
        statusCode: response.status,
      };
    } catch (error) {
      exporterLog('warn', 'trace.batch_export_attempt_failed', {
        errorName: error instanceof Error ? error.name : 'unknown',
        batchSize: batch.length,
      });
      return { accepted: false, retryable: true };
    } finally {
      clearTimeout(timeout);
    }
  }

  #logDroppedSpans(): void {
    const now = Date.now();
    if (now - this.#lastDropLogAt < 60_000) return;
    this.#lastDropLogAt = now;
    exporterLog('warn', 'trace.queue_full', {
      droppedSpans: this.#droppedSpans,
      maxQueueSize: this.#options.maxQueueSize,
    });
    this.#droppedSpans = 0;
  }
}
