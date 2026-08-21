import { isIP } from 'node:net';

export const BOOKINGOS_CLIENT_IP_HEADER = 'x-bookingos-client-ip';

export function trustedClientIpFromRequest(request: Request): string | undefined {
  const raw = request.headers.get(BOOKINGOS_CLIENT_IP_HEADER)?.trim();
  if (!raw || raw.includes(',') || isIP(raw) === 0) return undefined;
  return raw;
}

export function trustedClientIpHeaders(request: Request): Record<string, string> {
  const value = trustedClientIpFromRequest(request);
  return value ? { [BOOKINGOS_CLIENT_IP_HEADER]: value } : {};
}
