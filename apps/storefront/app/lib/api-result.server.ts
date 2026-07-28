import type { ApiResult } from '@booking/api-client';
import { createTranslator, type Locale } from '@booking/i18n';

const SAFE_ERROR_CODE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const SAFE_FIELD_NAME_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;
const MAX_FIELD_ERROR_KEYS = 50;
const MAX_FIELD_MESSAGES = 5;

export function apiFailureStatus(result: ApiResult<unknown>): number {
  if (result.failure === 'timeout') return 504;
  if (result.failure === 'invalid-response') return 502;
  if (result.status >= 500 || result.failure === 'network') return 503;
  return result.status || 500;
}

export function rethrowApiInfrastructureFailure(result: ApiResult<unknown>): void {
  if (result.ok) return;
  const status = apiFailureStatus(result);
  if (status >= 500) {
    throw new Response('Storefront API request failed', { status });
  }
}

export function readFailure(result: ApiResult<unknown>): Response {
  return new Response('Storefront API request failed', {
    status: apiFailureStatus(result),
  });
}

function safeErrorCode(value: string | undefined): string | undefined {
  const code = value?.trim();
  return code && SAFE_ERROR_CODE_RE.test(code) ? code : undefined;
}

function safeFieldErrors(
  value: Record<string, string[]> | undefined,
): Record<string, string[]> | undefined {
  if (!value) return undefined;

  const entries = Object.entries(value)
    .slice(0, MAX_FIELD_ERROR_KEYS)
    .flatMap(([field, messages]) => {
      if (!SAFE_FIELD_NAME_RE.test(field) || !Array.isArray(messages)) return [];
      const safeMessages = [
        ...new Set(
          messages
            .slice(0, MAX_FIELD_MESSAGES)
            .map((message) => safeErrorCode(message) ?? 'INVALID_VALUE'),
        ),
      ];
      return safeMessages.length ? [[field, safeMessages] as const] : [];
    });

  return entries.length ? Object.fromEntries(entries) : undefined;
}

function safeFailureMessage(request: Request, result: ApiResult<unknown>): string {
  const locale: Locale = /^\/en(?:\/|$)/.test(new URL(request.url).pathname) ? 'en' : 'vi';
  const { t } = createTranslator(locale);
  if (result.failure === 'timeout') {
    return t('errors.api.timeout');
  }
  if (result.failure === 'network') {
    return t('errors.api.network');
  }
  if (result.failure === 'invalid-response') {
    return t('errors.api.invalidResponse');
  }
  return t('errors.api.generic');
}

/**
 * API responses may contain implementation messages that are useful in backend
 * logs but must never enter Storefront loader/action hydration payloads.
 * Preserve only stable problem codes, bounded field-error codes, status and
 * request IDs; replace every free-form message with a localized generic error.
 */
export function sanitizeApiResult<T>(request: Request, result: ApiResult<T>): ApiResult<T> {
  if (result.ok) return result;

  const fieldErrors = safeFieldErrors(result.fieldErrors ?? result.errors);
  return {
    ...result,
    error: safeFailureMessage(request, result),
    code: safeErrorCode(result.code),
    errors: fieldErrors,
    fieldErrors,
  };
}
