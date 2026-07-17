/**
 * The affiliate-detail route action's result shape. Declared here (not exported
 * from the route) so fetcher-driven components can type `useFetcher<...>()`
 * without importing from `routes/**`; the route's action returns objects that
 * `satisfies` this shape.
 */
export interface AffiliateDetailActionData {
  ok: boolean;
  error: string | null;
  message: string | null;
}
