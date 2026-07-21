import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';
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

interface OtlpHttpResponse {
  statusCode: number;
  retryAfter?: string;
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
    ...options.resourceAttributes,
    'service.name': options.serviceName,
    'service.version': options.serviceVersion,
    'telemetry.sdk.language': 'nodejs',
    'telemetry.sdk.name': 'booking-storefront-native',
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

function retryAfterMilliseconds(value: string | undefined): number | undefined {
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

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function postOtlp(
  endpoint: URL,
  headers: Readonly<Record<string, string>>,
  body: string | Buffer,
  timeoutMs: number,
): Promise<OtlpHttpResponse> {
  return new Promise((resolve, reject) => {
    const requestFactory = endpoint.protocol === 'https:' ? httpsRequest : httpRequest;
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    const request = requestFactory(
      endpoint,
      {
        method: 'POST',
        headers,
      },
      (response) => {
        response.resume();
        response.once('end', () => {
          finish(() =>
            resolve({
              statusCode: response.statusCode ?? 0,
              retryAfter: firstHeader(response.headers['retry-after']),
            }),
          );
        });
        response.once('error', (error) => finish(() => reject(error)));
      },
    );

    const timeout = setTimeout(() => {
      const error = new Error('OTLP trace export timed out');
      error.name = 'TimeoutError';
      request.destroy(error);
    }, timeoutMs);
    timeout.unref?.();

    request.once('error', (error) => finish(() => reject(error)));
    request.end(body);
  });
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
    let attempts = 0;

    for (let attempt = 1; attempt <= MAX_EXPORT_ATTEMPTS; attempt += 1) {
      attempts = attempt;
      lastResult = await this.#sendBatch(batch);
      if (lastResult.accepted) return;
      if (!lastResult.retryable || attempt === MAX_EXPORT_ATTEMPTS) break;
      await delay(retryDelayMilliseconds(attempt, lastResult.retryAfterMs));
    }

    exporterLog('error', 'trace.batch_export_failed', {
      batchSize: batch.length,
      attempts,
      ...(lastResult?.statusCode ? { statusCode: lastResult.statusCode } : {}),
      retryable: lastResult?.retryable ?? true,
    });
  }

  async #sendBatch(batch: readonly StorefrontSpanRecord[]): Promise<ExportAttemptResult> {
    try {
      const json = JSON.stringify(exportPayload(batch, this.#options));
      const compressed = this.#options.compression === 'gzip';
      const body = compressed ? gzipSync(json) : json;
      const headers: Record<string, string> = {
        ...this.#options.headers,
        accept: 'application/json',
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
        'user-agent': `booking-storefront-otlp/${this.#options.serviceVersion}`,
        ...(compressed ? { 'content-encoding': 'gzip' } : {}),
      };

      const response = await postOtlp(
        this.#options.endpoint,
        headers,
        body,
        this.#options.timeoutMs,
      );
      if (response.statusCode === 200) return { accepted: true, retryable: false };
      return {
        accepted: false,
        retryable: RETRYABLE_STATUS_CODES.has(response.statusCode),
        retryAfterMs: retryAfterMilliseconds(response.retryAfter),
        statusCode: response.statusCode,
      };
    } catch (error) {
      exporterLog('warn', 'trace.batch_export_attempt_failed', {
        errorName: error instanceof Error ? error.name : 'unknown',
        batchSize: batch.length,
      });
      return { accepted: false, retryable: true };
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
