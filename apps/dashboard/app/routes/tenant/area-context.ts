import { useOutletContext } from 'react-router';

/**
 * Cross-cutting state the tenant `_layout` resolves once (from the subscription
 * status, §6.5) and shares with every child route via the router `<Outlet>`
 * context. Child screens read it to disable write actions when the tenant is in
 * the read-only / over-quota state — the backend enforces the same rules, this is
 * the UI half.
 */
export interface TenantAreaContext {
  /** True when the subscription has expired/cancelled → all writes are blocked. */
  readOnly: boolean;
  /** True when the tenant is over its soft monthly-bookings quota (non-blocking). */
  overLimit: boolean;
}

/** Read the tenant-area context provided by `routes/tenant/_layout.tsx`. */
export function useTenantArea(): TenantAreaContext {
  return useOutletContext<TenantAreaContext>();
}
