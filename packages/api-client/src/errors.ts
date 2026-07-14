/**
 * Error utilities for normalising backend error payloads.
 *
 * The backend follows RFC7807 Problem Details: `{ message, code, details }`.
 */

import type { ApiResult } from './types';

type BackendErrorBody = {
  message?: string;
  error?: string;
  code?: string;
  details?: { fieldErrors?: Record<string, string[]> };
  fieldErrors?: Record<string, string[]>;
};

/** Parse a raw fetch Response body into a standardised ApiResult. */
export async function toResult<T>(res: Response): Promise<ApiResult<T>> {
  const status = res.status;
  if (status === 204) return { ok: true, status, data: null };

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (res.ok) return { ok: true, status, data: payload as T };

  const body = (payload ?? {}) as BackendErrorBody;
  const fieldErrors =
    body.details?.fieldErrors ?? (typeof body.fieldErrors === 'object' ? body.fieldErrors : undefined);

  return {
    ok: false,
    status,
    data: null,
    error: body.message ?? body.error ?? `Request failed (${status})`,
    code: body.code,
    errors: fieldErrors,
    fieldErrors,
  };
}

/** Standard network-error result when fetch itself throws. */
export function networkError<T>(message = 'Không kết nối được máy chủ.'): ApiResult<T> {
  return { ok: false, status: 503, data: null, error: message };
}
