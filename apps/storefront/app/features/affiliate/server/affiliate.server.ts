import { randomUUID } from 'node:crypto';
import { affiliateResponseSchema, trackReferralResponseSchema } from '@booking/contracts';
import { createCookie } from 'react-router';
import { apiPost, publicPost } from '~/lib/api.server';
import { storefrontEnv } from '~/lib/env.server';

/**
 * Server-only affiliate attribution (§15.1). The storefront reads `?ref=CODE`,
 * records the click via the backend, and stores a per-tenant `aff_<tenantId>`
 * cookie (30 days, last-click wins). At checkout the cookie is replayed into the
 * booking as `refCode` — the browser never sees or sends the code itself.
 */
const AFF_PREFIX = 'aff_';
const VISITOR_COOKIE = 'sf_visitor';
const REF_CODE_RE = /^R-[A-HJ-NP-Z2-9]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** 30-day attribution window (§15.1). Configurable per tenant is a later phase. */
const AFF_MAX_AGE = 60 * 60 * 24 * 30;
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;

function signedCookie(name: string, maxAge: number) {
  return createCookie(name, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: storefrontEnv.secureCookies,
    secrets: [...storefrontEnv.sessionSecrets],
    maxAge,
  });
}

function attributionCookie(tenantId: string) {
  return signedCookie(`${AFF_PREFIX}${tenantId}`, AFF_MAX_AGE);
}

const visitorCookie = signedCookie(VISITOR_COOKIE, VISITOR_MAX_AGE);

/** The referral code currently attributed for this tenant, if any. */
export async function readRefCode(request: Request, tenantId: string): Promise<string | null> {
  const value: unknown = await attributionCookie(tenantId).parse(request.headers.get('Cookie'));
  return typeof value === 'string' && REF_CODE_RE.test(value) ? value : null;
}

/** `Set-Cookie` storing the last-clicked referral code for this tenant. */
export function refAttributionCookie(tenantId: string, code: string): Promise<string> {
  return attributionCookie(tenantId).serialize(code);
}

/** A stable signed per-browser id used to de-dup clicks. */
export async function resolveVisitorId(
  request: Request,
): Promise<{ id: string; setCookie: string | null }> {
  const existing: unknown = await visitorCookie.parse(request.headers.get('Cookie'));
  if (typeof existing === 'string' && UUID_RE.test(existing)) {
    return { id: existing, setCookie: null };
  }

  const id = randomUUID();
  return { id, setCookie: await visitorCookie.serialize(id) };
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
