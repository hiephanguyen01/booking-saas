/**
 * Server-only helpers for partner self-registration (§7.3 "signup + tenant
 * approval"). The storefront otherwise only calls public endpoints; this is the
 * one flow that needs an authenticated backend call, so we mint a session token
 * from `POST /auth/register` (or `/auth/login` for an existing account) and
 * replay it to `POST /partners/apply` — all server-side, in one request. The
 * token is used in-memory for the single apply call and never persisted (the
 * storefront stays stateless; the partner re-authenticates on the dashboard).
 */

import { partnerResponseSchema, type PartnerApplyInput } from '@booking/contracts';
import { apiPost, backendLogin, backendRegister } from './api.server';

export interface RegisterCredentials {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export type PartnerApplyPayload = PartnerApplyInput;

/** A message code the route maps with `useTranslation(NsI18n.Common)`. */
export type PartnerErrorCode =
  | 'emailTakenWrongPassword'
  | 'slugTaken'
  | 'planLimit'
  | 'tenantInactive'
  | 'invalidLocation'
  | 'generic';
type ErrorCode = PartnerErrorCode;
type TokenResult =
  | { ok: true; token: string }
  | { ok: false; code: ErrorCode; status: number };

/**
 * Register a fresh account, or — if the email already exists (register 409) —
 * log in with the supplied password. Either way returns the `sid` access token.
 */
export async function registerOrLogin(
  request: Request,
  creds: RegisterCredentials,
): Promise<TokenResult> {
  const registration = await backendRegister(request, creds);
  if (registration.ok && registration.tokens) {
    return { ok: true, token: registration.tokens.accessToken };
  }
  if (registration.status !== 409) {
    return { ok: false, code: 'generic', status: registration.status };
  }
  const login = await backendLogin(request, {
    email: creds.email,
    password: creds.password,
  });
  if (!login.ok || !login.tokens) {
    return { ok: false, code: 'emailTakenWrongPassword', status: login.status };
  }
  return { ok: true, token: login.tokens.accessToken };
}

const APPLY_ERROR_CODES: Record<string, ErrorCode> = {
  PARTNER_SLUG_TAKEN: 'slugTaken',
  PLAN_LIMIT_REACHED: 'planLimit',
  TENANT_INACTIVE: 'tenantInactive',
  TENANT_NOT_FOUND: 'generic',
  INVALID_ADMINISTRATIVE_DIVISION: 'invalidLocation',
};

/** Submit the partner application with the just-minted session token. */
export async function applyAsPartner(
  request: Request,
  token: string,
  input: PartnerApplyPayload,
): Promise<{ ok: true } | { ok: false; code: ErrorCode; status: number }> {
  const result = await apiPost(request, '/partners/apply', input, token, {
    schema: partnerResponseSchema,
  });
  if (result.ok) return { ok: true };
  const code = result.code ? APPLY_ERROR_CODES[result.code] : undefined;
  return { ok: false, code: code ?? 'generic', status: result.status };
}
