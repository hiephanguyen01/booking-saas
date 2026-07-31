import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../../../shared/tenant-context/tenant-context.service';
import type { SessionPrincipal } from '../../../../identity-access/domain/ports/session-store.port';
import { RequireAffiliateMembershipUseCase } from '../../../application/use-cases/require-affiliate-membership.use-case';

/**
 * Seeds `TenantContextService` on affiliate self-service write routes so that
 * downstream guards/repositories which read `TenantContextService` (e.g.
 * `legal`'s `RequireCurrentAgreementGuard`) have a tenant to check.
 *
 * `AffiliateController` is entirely `@AuthenticatedOnly()` (membership-gated,
 * not RBAC — see its own docblock): `PermissionsGuard` only calls
 * `tenantContext.setTenantId()` on its `@RequirePermissions` branch, so on
 * every affiliate route the store is otherwise empty and
 * `TenantContextService.tenantIdOrThrow()` throws a 500. Unlike an RBAC route,
 * an affiliate route has no `x-tenant-id` header verified against a role
 * assignment — the caller's tenant is instead the tenant of their own
 * affiliate membership (resolved the same way the controller already resolves
 * it for the business use-cases: `x-affiliate-tenant` header when the user is
 * an affiliate for more than one tenant, else the sole/first membership).
 *
 * Deliberately uses `RequireAffiliateMembershipUseCase` (membership in any
 * status), not `RequireApprovedAffiliateUseCase` — this guard only needs to
 * resolve *which tenant*, not gate on approval; approval-gated routes
 * (`links` POST/DELETE) still separately call `RequireApprovedAffiliateUseCase`
 * in the controller body, so this never widens what a caller can reach. A
 * caller with no resolvable membership fails closed: the use-case throws the
 * named 403 `AffiliateMembershipRequired`, not a 500.
 *
 * Apply to affiliate write routes only, ahead of
 * `RequireCurrentAgreementGuard` (`@UseGuards(ResolveAffiliateTenantContextGuard,
 * RequireCurrentAgreementGuard)`). Never applied to `POST /affiliate/apply`:
 * that route is the consent-recording action itself, and a first-time
 * applicant has no prior acceptance to check — gating it here would 403
 * every first application before the form that records consent ever runs.
 */
@Injectable()
export class ResolveAffiliateTenantContextGuard implements CanActivate {
  constructor(
    private readonly requireMembership: RequireAffiliateMembershipUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const principal: SessionPrincipal | undefined = req.principal;
    // SessionAuthGuard already denies an unauthenticated caller before this
    // guard ever runs.
    if (!principal) return true;

    const tenantHeader: string | undefined = req.headers['x-affiliate-tenant'];
    const ctx = await this.requireMembership.execute(principal.userId, tenantHeader);
    this.tenantContext.setTenantId(ctx.tenantId);
    return true;
  }
}
