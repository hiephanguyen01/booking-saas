import { performance } from 'node:perf_hooks';
import { getCurrentStorefrontRequestContext } from './request-context.server';
import { initializeStorefrontTracing } from './tracing-runtime.server';

initializeStorefrontTracing();

type StorefrontLogLevel = 'info' | 'warn' | 'error';
type StorefrontLogDetails = Record<string, unknown>;

function errorDetails(error: unknown): Record<string, string> | undefined {
  if (!(error instanceof Error)) return error === undefined ? undefined : { message: String(error) };
  return {
    name: error.name,
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
  };
}

function elapsedMilliseconds(startedAtMs: number): number {
  return Number(Math.max(0, performance.now() - startedAtMs).toFixed(1));
}

function write(
  level: StorefrontLogLevel,
  event: string,
  details: StorefrontLogDetails = {},
  error?: unknown,
): void {
  const context = getCurrentStorefrontRequestContext();
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: 'storefront',
    event,
    ...details,
    ...(context
      ? {
          requestId: context.request.id,
          requestMethod: context.request.method,
          requestPath: context.request.path,
          tenantId: context.tenant.id,
          traceId: context.trace.traceId,
          spanId: context.trace.spanId,
          requestElapsedMs: elapsedMilliseconds(context.request.startedAtMs),
        }
      : {}),
    ...(error !== undefined ? { error: errorDetails(error) } : {}),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export function storefrontLogInfo(event: string, details?: StorefrontLogDetails): void {
  write('info', event, details);
}

export function storefrontLogWarn(
  event: string,
  details?: StorefrontLogDetails,
  error?: unknown,
): void {
  write('warn', event, details, error);
}

export function storefrontLogError(
  event: string,
  error: unknown,
  details?: StorefrontLogDetails,
): void {
  write('error', event, details, error);
}

export function storefrontLogHttpResponse(
  event: string,
  statusCode: number,
  details?: StorefrontLogDetails,
): void {
  const level: StorefrontLogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  write(level, event, { ...details, statusCode });
}
