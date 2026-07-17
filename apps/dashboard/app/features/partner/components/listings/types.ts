/**
 * Result shape of the partner listings index route action (submit / hide /
 * republish). Declared here — not in the route — so `ListingRowActions` can type
 * its fetcher without importing from `routes/**`; the route action returns this
 * same shape (a route importing a feature type is the sanctioned direction).
 */
export interface ListingsActionResult {
  ok: boolean;
  error: string | null;
}
