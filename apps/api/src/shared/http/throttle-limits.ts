/**
 * Rate-limit budgets. Read this before changing a number — they do not mean what
 * they look like they mean.
 *
 * THESE ARE SITE-WIDE BUDGETS, NOT PER-USER ONES. Every browser request reaches
 * the API through an SSR loader or action (`AGENTS.md`: frontends never fetch the
 * backend from the browser), so the API sees ONE source address — the storefront
 * or dashboard container on the compose network — for every visitor on the site.
 * `req.ip` is the socket peer (there is no global `trust proxy`), so the default
 * ThrottlerGuard buckets the entire site together.
 *
 * The consequence is what these numbers are sized against: one page render costs
 * a handful of API calls, so a single visitor browsing normally spends dozens of
 * calls a minute. Treat these as a CAPACITY CEILING, not a client abuse control.
 *
 * `/auth/login` has its own dedicated abuse control: Caddy overwrites a canonical
 * client-IP header, the BFF validates/forwards one literal IP, and the API applies
 * Redis-backed pair/IP sliding-window limits keyed from that trusted source. Do
 * not lower the shared Nest throttle expecting it to provide equivalent login
 * protection; it would rate-limit the frontend containers before individual
 * abusive clients.
 */

const MINUTE = 60_000;

/** Applied to every route without a `@Throttle` override. ~20 req/s. */
export const GLOBAL_THROTTLE = { ttl: MINUTE, limit: 1_200 } as const;

function perMinute(limit: number) {
  return { default: { ttl: MINUTE, limit } } as const;
}

/** Starting or completing a registration / password reset; changing a password. */
export const THROTTLE_AUTH_FLOW = perMinute(60);

/** Re-sending an OTP. Kept tighter than the rest: each one sends a real email. */
export const THROTTLE_AUTH_RESEND = perMinute(30);

/** Submitting an OTP, logging in, upgrading a guest — the high-traffic steps. */
export const THROTTLE_AUTH_ATTEMPT = perMinute(120);

/** Writing one's own profile. */
export const THROTTLE_PROFILE_WRITE = perMinute(200);

/** Requesting a presigned upload URL. One listing form can ask for several. */
export const THROTTLE_UPLOAD = perMinute(200);
