import { randomUUID } from 'node:crypto';
import type { TrackReferralResponse } from '@booking/contracts';

/**
 * Server-only affiliate attribution (§15.1). The storefront reads `?ref=CODE`,
 * records the click via the backend, and stores a per-tenant `aff_<tenantId>`
 * cookie (30 days, last-click wins). At checkout the cookie is replayed into the
 * booking as `refCode` — the browser never sees or sends the code itself.
 */
const AFF_PREFIX = 'aff_';
const VISITOR_COOKIE = 'sf_visitor';
/** 30-day attribution window (§15.1). Configurable per tenant is a later phase. */
const AFF_MAX_AGE = 60 * 60 * 24 * 30;
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;

const backendUrl = (): string => process.env.BACKEND_URL ?? 'http://localhost:3000';

function hostOf(request: Request): string {
  return (request.headers.get('host') ?? 'localhost').split(':')[0];
}

function readCookie(request: Request, name: string): string | null {
  const match = (request.headers.get('cookie') ?? '').match(
    new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/** The referral code currently attributed for this tenant, if any. */
export function readRefCode(request: Request, tenantId: string): string | null {
  return readCookie(request, `${AFF_PREFIX}${tenantId}`);
}

/** `Set-Cookie` storing the last-clicked referral code for this tenant. */
export function refAttributionCookie(tenantId: string, code: string): string {
  return `${AFF_PREFIX}${tenantId}=${encodeURIComponent(code)}; Path=/; Max-Age=${AFF_MAX_AGE}; HttpOnly; SameSite=Lax`;
}

/** A stable per-browser id used to de-dup clicks. Returns the existing id or mints one. */
export function resolveVisitorId(request: Request): { id: string; setCookie: string | null } {
  const existing = readCookie(request, VISITOR_COOKIE);
  if (existing) return { id: existing, setCookie: null };
  const id = randomUUID();
  return {
    id,
    setCookie: `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=${VISITOR_MAX_AGE}; HttpOnly; SameSite=Lax`,
  };
}

/**
 * Record a referral click on the backend (tenant resolved from Host). Returns
 * true when the code matched an approved affiliate — the caller then sets the
 * attribution cookie. Network/validation failures degrade to `false`.
 */
export async function trackReferral(
  request: Request,
  code: string,
  visitorId: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl()}/public/referrals/track`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-forwarded-host': hostOf(request),
      },
      body: JSON.stringify({ code, visitorId }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as TrackReferralResponse;
    return body.valid === true;
  } catch {
    return false;
  }
}

export interface AffiliateApplyPayload {
  tenantId: string;
  payoutInfo: { bankName?: string; accountNo?: string; accountHolder?: string; note?: string };
}

/**
 * Submit an affiliate application with a just-minted session token (mirrors the
 * partner apply flow). The token is used in-memory for this one call and never
 * persisted — the affiliate re-authenticates on the dashboard.
 */
export async function applyAsAffiliate(
  token: string,
  input: AffiliateApplyPayload,
): Promise<{ ok: true } | { ok: false; code: string }> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/affiliate/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', cookie: `sid=${token}` },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, code: 'generic' };
  }
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: false, code: body.code ?? 'generic' };
}
