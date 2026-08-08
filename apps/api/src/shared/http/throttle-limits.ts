/**
 * Rate-limit budgets. Read this before changing a number — they do not mean what
 * they look like they mean.
 *
 * THESE ARE SITE-WIDE BUDGETS, NOT PER-USER ONES. Every browser request reaches
 * the API through an SSR loader or action (`AGENTS.md`: frontends never fetch the
 * backend from the browser), so the API sees ONE source address — the storefront
 * or dashboard container on the compose network — for every visitor on the site.
 * `req.ip` is the socket peer (there is no `trust proxy`, and `@booking/api-client`
 * forwards no `x-forwarded-for`), so ThrottlerGuard buckets the entire site
 * together. The same reasoning is already written down for the on-demand-TLS
 * `ask` endpoint, which carries `@SkipThrottle()` for exactly this reason.
 *
 * The consequence is what these numbers are sized against: one page render costs
 * a handful of API calls, so a single visitor browsing normally spends dozens of
 * calls a minute. The previous values read as per-user (100/min global, 5/min to
 * start a registration) but were spent collectively — a few real users on the
 * site at once locked everyone out with 429, and two people signing up in the
 * same minute was already over the limit.
 *
 * So treat these as a CAPACITY CEILING, not an abuse control. Per-user limiting
 * has to happen where the real client IP still exists: at the edge (Caddy/nginx),
 * or by forwarding the client IP from the frontends and teaching ThrottlerGuard
 * to key on it. Neither exists yet. Until one does, raising a number here costs
 * nothing in real protection, and lowering one locks out real users first.
 *
 * Credential-guessing is not defended here in any case — that belongs on the
 * account and the OTP challenge (attempt counters), not on a shared IP bucket.
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
