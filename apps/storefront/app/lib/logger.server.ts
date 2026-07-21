import { getCurrentStorefrontRequestContext } from './request-context.server';

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
    ...(context
      ? {
          requestId: context.request.id,
          requestMethod: context.request.method,
          requestPath: context.request.path,
          tenantId: context.tenant.id,
        }
      : {}),
    ...details,
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
