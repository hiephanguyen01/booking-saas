/**
 * Membership-gated resolution for the affiliate self-service portal (§15.3).
 * Affiliates are NOT an RBAC scope, so `@AuthenticatedOnly` routes never seed a
 * tenant context — the require-* use-cases resolve a logged-in user's
 * `affiliates` rows via the BYPASSRLS admin pool (strictly by `userId`), then the
 * caller runs all real work inside `forTenant(context.tenantId)`.
 */
export interface AffiliateContext {
  affiliateId: string;
  tenantId: string;
}
