import { isIP } from 'node:net';

export const BOOKINGOS_CLIENT_IP_HEADER = 'x-bookingos-client-ip';

export function parseTrustedClientIpHeader(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return undefined;
  const normalized = value?.trim();
  if (!normalized || normalized.includes(',') || isIP(normalized) === 0) return undefined;
  return normalized;
}
