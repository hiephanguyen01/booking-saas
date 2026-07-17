import { randomUUID } from 'node:crypto';
import { affiliateResponseSchema, trackReferralResponseSchema } from '@booking/contracts';
import { apiPost, publicPost } from './api.server';

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
  const result = await publicPost(
    request,
    '/public/referrals/track',
    { code, visitorId },
    { schema: trackReferralResponseSchema },
  );
  if (!result.ok || !result.data) {
    console.warn('Storefront referral tracking failed', {
      status: result.status,
      failure: result.failure,
      requestId: result.requestId,
    });
    return false;
  }
  return result.data.valid;
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
  request: Request,
  token: string,
  input: AffiliateApplyPayload,
): Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  const result = await apiPost(request, '/affiliate/apply', input, token, {
    schema: affiliateResponseSchema,
  });
  if (result.ok) return { ok: true };
  return { ok: false, code: result.code ?? 'generic', status: result.status };
}
