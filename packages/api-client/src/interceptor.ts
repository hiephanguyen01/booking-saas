import type { AxiosResponse } from 'axios';
import type { ApiAuth } from './types';

export function parseSetCookies(response: Pick<AxiosResponse, 'headers'>): Record<string, string> {
  const output: Record<string, string> = {};
  const raw = response.headers['set-cookie'];
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];

  for (const cookie of values) {
    const pair = cookie.split(';', 1)[0];
    if (!pair) continue;
    const separator = pair.indexOf('=');
    if (separator > 0) {
      output[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
    }
  }
  return output;
}

export function normalizeAuth(auth: string | ApiAuth): ApiAuth {
  return typeof auth === 'string' ? { token: auth } : auth;
}

export function scopeHeaders(auth: ApiAuth): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth.tenantId) headers['x-tenant-id'] = auth.tenantId;
  if (auth.partnerId) headers['x-partner-id'] = auth.partnerId;
  if (auth.affiliateTenantId) headers['x-affiliate-tenant'] = auth.affiliateTenantId;
  return headers;
}
