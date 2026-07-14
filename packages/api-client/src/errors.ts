import { AxiosError, isAxiosError, isCancel, type AxiosResponse } from 'axios';
import type { ZodType } from 'zod';
import type { ApiResult } from './types';

type BackendErrorBody = {
  message?: string;
  error?: string;
  code?: string;
  details?: { fieldErrors?: Record<string, string[]> };
  fieldErrors?: Record<string, string[]>;
};

function responseRequestId(response: AxiosResponse): string | undefined {
  const value = response.headers['x-request-id'];
  return typeof value === 'string' && value ? value : undefined;
}

export function toResult<T>(response: AxiosResponse, schema?: ZodType<T>): ApiResult<T> {
  const { status } = response;
  const requestId = responseRequestId(response);
  if (status === 204) return { ok: true, status, data: null, ...(requestId ? { requestId } : {}) };

  if (status >= 200 && status < 300) {
    if (schema) {
      const parsed = schema.safeParse(response.data);
      if (!parsed.success) {
        return {
          ok: false,
          status: 502,
          data: null,
          failure: 'invalid-response',
          error: 'Backend returned an invalid response.',
          ...(requestId ? { requestId } : {}),
        };
      }
      return { ok: true, status, data: parsed.data, ...(requestId ? { requestId } : {}) };
    }
    return { ok: true, status, data: response.data as T, ...(requestId ? { requestId } : {}) };
  }

  const body =
    response.data && typeof response.data === 'object'
      ? (response.data as BackendErrorBody)
      : ({} as BackendErrorBody);
  const fieldErrors =
    body.details?.fieldErrors ??
    (typeof body.fieldErrors === 'object' ? body.fieldErrors : undefined);

  return {
    ok: false,
    status,
    data: null,
    failure: 'http',
    error: body.message ?? body.error ?? `Request failed (${status})`,
    code: body.code,
    errors: fieldErrors,
    fieldErrors,
    ...(requestId ? { requestId } : {}),
  };
}

export function transportError<T>(error: unknown): ApiResult<T> {
  if (isCancel(error)) throw error;

  const timeout =
    isAxiosError(error) &&
    (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT);
  if (timeout) {
    return {
      ok: false,
      status: 504,
      data: null,
      failure: 'timeout',
      error: 'Yêu cầu tới máy chủ đã hết thời gian chờ.',
    };
  }

  return {
    ok: false,
    status: 503,
    data: null,
    failure: 'network',
    error: 'Không kết nối được máy chủ.',
  };
}

export function networkError<T>(message = 'Không kết nối được máy chủ.'): ApiResult<T> {
  return { ok: false, status: 503, data: null, failure: 'network', error: message };
}
