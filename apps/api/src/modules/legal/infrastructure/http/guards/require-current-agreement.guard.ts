import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../../../shared/tenant-context/tenant-context.service';
import type { SessionPrincipal } from '../../../../identity-access/domain/ports/session-store.port';
import { LegalAgreementOutdated } from '../../../domain/errors/legal-errors';
import {
  ListPendingAcceptancesUseCase,
  type PendingAcceptanceScope,
} from '../../../application/use-cases/list-pending-acceptances.use-case';

/**
 * Blocks a **write** in the partner or affiliate area until the signed-in
 * user has accepted the current material version of that area's binding
 * document (design §"Re-acceptance"). Apply with
 * `@UseGuards(RequireCurrentAgreementGuard)` to write routes only — read
 * routes stay open so a blocked user can still see their own data. Never
 * applied to a customer route: customers are never blocked (checkout
 * re-records consent silently instead).
 *
 * Modelled on `RequireActiveSubscriptionGuard`: it reads
 * `TenantContextService`, which `PermissionsGuard` seeds from the verified
 * `x-tenant-id`/`x-partner-id` scope **only on the `@RequirePermissions`
 * branch** — so this guard is only meaningful on a route that already carries
 * `@RequirePermissions(...)` (every current `partner.*`/`tenant.*` RBAC write
 * route). `partnerId` present narrows the pending check to that one partner
 * organisation (`ListPendingAcceptancesUseCase`'s optional 4th argument);
 * absent, it checks the affiliate scope for the tenant in context.
 *
 * KNOWN GAP (flag for whoever attaches this to affiliate write routes):
 * `affiliate.controller.ts`'s routes are today all `@AuthenticatedOnly()`
 * (membership-gated, not RBAC — see its own docblock), so `PermissionsGuard`
 * never seeds tenant context for them and `tenantIdOrThrow()` would 500
 * instead of 403 there. That module needs its own fix (populate tenant
 * context, or move to RBAC) before this guard can be attached to an affiliate
 * write route — out of `legal`'s scope to make that change.
 */
@Injectable()
export class RequireCurrentAgreementGuard implements CanActivate {
  constructor(
    private readonly listPending: ListPendingAcceptancesUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const principal: SessionPrincipal | undefined = req.principal;
    // SessionAuthGuard/PermissionsGuard already deny an unauthenticated or
    // unauthorized caller before this guard ever runs.
    if (!principal) return true;

    const tenantId = this.tenantContext.tenantIdOrThrow();
    const partnerId = this.tenantContext.partnerId();
    const scope: PendingAcceptanceScope = partnerId ? 'partner' : 'affiliate';

    const pending = await this.listPending.execute(tenantId, principal.userId, scope, partnerId ?? null);
    if (pending.length > 0) {
      throw new LegalAgreementOutdated();
    }
    return true;
  }
}
