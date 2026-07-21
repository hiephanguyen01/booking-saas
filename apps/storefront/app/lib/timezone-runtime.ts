export const STOREFRONT_FALLBACK_TIMEZONE = 'Asia/Ho_Chi_Minh';

type StorefrontTimezoneResolver = () => string | null | undefined;

let serverTimezoneResolver: StorefrontTimezoneResolver | undefined;
let clientTimezone = STOREFRONT_FALLBACK_TIMEZONE;

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

/**
 * Resolves legacy fallback calls to the current tenant timezone while preserving
 * an explicit resource timezone returned by availability APIs.
 */
export function resolveStorefrontTimezone(requested?: string): string {
  if (requested && requested !== STOREFRONT_FALLBACK_TIMEZONE) return requested;

  if (typeof window === 'undefined') {
    return serverTimezoneResolver?.() ?? requested ?? STOREFRONT_FALLBACK_TIMEZONE;
  }

  return clientTimezone || requested || STOREFRONT_FALLBACK_TIMEZONE;
}
