import { useOutletContext } from 'react-router';
import type { StorefrontContext } from '../root';

/** Access the request-scoped tenant bootstrap exposed by the root outlet. */
export function useStorefrontContext(): StorefrontContext {
  return useOutletContext<StorefrontContext>();
}

/** The tenant's IANA timezone for all customer-facing dates and wall-clock times. */
export function useStorefrontTimezone(): string {
  return useStorefrontContext().tenant.defaultTimezone;
}
