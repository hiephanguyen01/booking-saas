/**
 * Server-only helpers for partner self-registration (§7.3 "signup + tenant
 * approval"). The storefront otherwise only calls public endpoints; this is the
 * one flow that needs an authenticated backend call, so we mint a session token
 * from `POST /auth/register` (or `/auth/login` for an existing account) and
 * replay it to `POST /partners/apply` — all server-side, in one request. The
 * token is used in-memory for the single apply call and never persisted (the
 * storefront stays stateless; the partner re-authenticates on the dashboard).
 */

const backendUrl = (): string => process.env.BACKEND_URL ?? 'http://localhost:3000';

const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json' } as const;

/** Lift cookie name→value pairs from a fetch Response's Set-Cookie headers. */
function parseSetCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const raw of list) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    if (idx > -1) out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export interface PartnerApplyPayload {
  tenantId: string;
  name: string;
  slug: string;
  partnerType: 'individual' | 'company';
  description?: string;
  businessInfo?: Record<string, unknown>;
}

/** A message code the route maps to `t('common.becomePartner.errors.<code>')`. */
type ErrorCode = string;
type TokenResult = { ok: true; token: string } | { ok: false; code: ErrorCode };

/**
 * Register a fresh account, or — if the email already exists (register 409) —
 * log in with the supplied password. Either way returns the `sid` access token.
 */
export async function registerOrLogin(creds: RegisterCredentials): Promise<TokenResult> {
  let reg: Response;
  try {
    reg = await fetch(`${backendUrl()}/auth/register`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        email: creds.email,
        password: creds.password,
        fullName: creds.fullName,
        ...(creds.phone ? { phone: creds.phone } : {}),
      }),
    });
  } catch {
    return { ok: false, code: 'generic' };
  }

  if (reg.ok) {
    const sid = parseSetCookies(reg).sid;
    return sid ? { ok: true, token: sid } : { ok: false, code: 'generic' };
  }

  // A 409 means the email is already registered → try logging in instead.
  if (reg.status === 409) {
    let login: Response;
    try {
      login = await fetch(`${backendUrl()}/auth/login`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ email: creds.email, password: creds.password }),
      });
    } catch {
      return { ok: false, code: 'generic' };
    }
    if (!login.ok) return { ok: false, code: 'emailTakenWrongPassword' };
    const sid = parseSetCookies(login).sid;
    return sid ? { ok: true, token: sid } : { ok: false, code: 'generic' };
  }

  return { ok: false, code: 'generic' };
}

const APPLY_ERROR_CODES: Record<string, ErrorCode> = {
  PARTNER_SLUG_TAKEN: 'slugTaken',
  PLAN_LIMIT_REACHED: 'planLimit',
  TENANT_INACTIVE: 'tenantInactive',
  TENANT_NOT_FOUND: 'generic',
};

/** Submit the partner application with the just-minted session token. */
export async function applyAsPartner(
  token: string,
  input: PartnerApplyPayload,
): Promise<{ ok: true } | { ok: false; code: ErrorCode }> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/partners/apply`, {
      method: 'POST',
      headers: { ...JSON_HEADERS, cookie: `sid=${token}` },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, code: 'generic' };
  }
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: false, code: (body.code && APPLY_ERROR_CODES[body.code]) ?? 'generic' };
}
