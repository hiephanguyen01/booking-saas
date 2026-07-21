export const STOREFRONT_FALLBACK_TIMEZONE = 'Asia/Ho_Chi_Minh';

type StorefrontTimezoneResolver = () => string | null | undefined;

let serverTimezoneResolver: StorefrontTimezoneResolver | undefined;
let clientTimezone = STOREFRONT_FALLBACK_TIMEZONE;

function currentStorefrontTimezone(): string {
  if (typeof window === 'undefined') {
    return serverTimezoneResolver?.() ?? STOREFRONT_FALLBACK_TIMEZONE;
  }
  return clientTimezone || STOREFRONT_FALLBACK_TIMEZONE;
}

/**
 * A string-compatible token for legacy call sites. `Intl` converts `timeZone`
 * values with ToString, so the token resolves from request ALS during SSR and
 * from the tenant bootstrap in the browser without sharing per-request state.
 *
 * A real resource timezone remains a normal string, including the valid zone
 * `Asia/Ho_Chi_Minh`; it is therefore never mistaken for the tenant fallback.
 */
const tenantTimezoneToken = Object.freeze({
  toString: currentStorefrontTimezone,
  [Symbol.toPrimitive]: currentStorefrontTimezone,
});

export const STOREFRONT_TENANT_TIMEZONE = tenantTimezoneToken as unknown as string;

/**
 * Registers the server-side resolver once. The resolver itself reads from the
 * request AsyncLocalStorage, so concurrent tenants never share timezone state.
 */
export function registerStorefrontTimezoneResolver(
  resolver: StorefrontTimezoneResolver,
): void {
  if (typeof window === 'undefined') serverTimezoneResolver = resolver;
}

/** Sets the browser runtime timezone before Storefront route children render. */
export function setClientStorefrontTimezone(timezone: string): void {
  if (typeof window !== 'undefined') clientTimezone = timezone;
}

/** Resolves the tenant token while preserving every explicit resource timezone. */
export function resolveStorefrontTimezone(requested?: string): string {
  if (requested && requested !== STOREFRONT_TENANT_TIMEZONE) return requested;
  return currentStorefrontTimezone();
}
