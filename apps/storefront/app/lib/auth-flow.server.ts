import { randomUUID } from 'node:crypto';
import { createCookie } from 'react-router';
import { storefrontRedisStore } from './redis-store.server';

const FLOW_TTL_SECONDS = 30 * 60;
const PREFIX = 'bookify:storefront:auth-flow:';

export type AuthFlowPhase =
  | 'registration_verify'
  | 'registration_password'
  | 'registration_success'
  | 'partner_registration_verify'
  | 'partner_registration_password'
  | 'partner_registration_profile'
  | 'partner_registration_done'
  | 'reset_verify'
  | 'reset_password'
  | 'reset_success';

export interface AuthFlowRecord {
  phase: AuthFlowPhase;
  email?: string;
  challengeId?: string;
  completionToken?: string;
  maskedDestination?: string;
  resendAvailableAt?: number;
}

/**
 * The only flow fields a loader may hand to the client.
 *
 * An `AuthFlowRecord` carries `completionToken` — the bearer credential that
 * `POST /auth/registration/complete` accepts to set an account's password — and
 * the flow `id` is both the Redis key and the value of the httpOnly
 * `__storefront_auth_flow` cookie. React Router serializes every loader return
 * into the SSR hydration payload, so returning the raw record from a loader
 * publishes both to any script on the page and defeats the httpOnly cookie.
 * Loaders return this view; only server-side actions touch the record itself.
 */
export interface AuthFlowView {
  maskedDestination: string | null;
  resendAfterSec: number;
}

/** Narrow a flow record to the client-safe view. */
export function flowView(flow: {
  record: AuthFlowRecord;
  resendAfterSec: number;
}): AuthFlowView {
  return {
    maskedDestination: flow.record.maskedDestination ?? null,
    resendAfterSec: flow.resendAfterSec,
  };
}

const flowSecret = process.env.SESSION_SECRET_CURRENT ?? process.env.SESSION_SECRET;
if (!flowSecret || flowSecret.length < 32) {
  throw new Error('SESSION_SECRET_CURRENT must contain at least 32 characters.');
}

const cookie = createCookie('__storefront_auth_flow', {
  httpOnly: true,
  path: '/',
  sameSite: 'lax',
  secure: process.env.SESSION_COOKIE_SECURE
    ? process.env.SESSION_COOKIE_SECURE !== 'false'
    : process.env.NODE_ENV === 'production',
  secrets: [flowSecret],
  maxAge: FLOW_TTL_SECONDS,
});

async function idFrom(request: Request) {
  const id: unknown = await cookie.parse(request.headers.get('Cookie'));
  return typeof id === 'string' && id ? id : null;
}

export const authFlow = {
  async read(request: Request): Promise<{ id: string; record: AuthFlowRecord } | null> {
    const id = await idFrom(request);
    if (!id) return null;
    const record = await storefrontRedisStore.get<AuthFlowRecord>(`${PREFIX}${id}`);
    return record ? { id, record } : null;
  },
  async create(request: Request, record: AuthFlowRecord) {
    const previous = await idFrom(request);
    if (previous) await storefrontRedisStore.delete(`${PREFIX}${previous}`);
    const id = randomUUID();
    await storefrontRedisStore.set(`${PREFIX}${id}`, record, FLOW_TTL_SECONDS);
    return cookie.serialize(id);
  },
  async update(id: string, record: AuthFlowRecord) {
    await storefrontRedisStore.set(`${PREFIX}${id}`, record, FLOW_TTL_SECONDS);
  },
  async destroy(request: Request) {
    const id = await idFrom(request);
    if (id) await storefrontRedisStore.delete(`${PREFIX}${id}`);
    return cookie.serialize('', { expires: new Date(0), maxAge: 0 });
  },
};
