import { Inject, Injectable } from '@nestjs/common';
import { uuidSchema } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { MissingTenantHost } from '../../../../shared/http/request-boundary-errors';
import {
  PERMISSION_RESOLVER,
  type IPermissionResolver,
} from '../../../identity-access/domain/ports/permission-resolver.port';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import type { PendingAcceptanceScope } from './list-pending-acceptances.use-case';

export interface LegalCallerScopeInput {
  userId: string;
  /** `x-tenant-id` — names a tenant/partner RBAC scope; verified below. */
  tenantIdHeader?: string;
  /** `x-partner-id` — names one partner organisation; verified below. */
  partnerIdHeader?: string;
  /** `x-affiliate-tenant` — selects one of the caller's affiliate memberships. */
  affiliateTenantHeader?: string;
  forwardedHost?: string;
  host?: string;
}

export interface LegalCallerScope {
  tenantId: string;
  /** The partner organisation the caller is provably acting as, or null. */
  partnerId: string | null;
  /** Which re-acceptance gates apply to this caller. Empty = none apply. */
  scopes: readonly PendingAcceptanceScope[];
}

/**
 * Resolves which tenant — and which re-acceptance gate — a `/me/legal/*` call
 * belongs to.
 *
 * These routes are `@AuthenticatedOnly()`, so `PermissionsGuard` short-circuits
 * before it seeds `TenantContextService` (it only does that on the
 * `@RequirePermissions` branch) and there is no tenant in context. Host-only
 * resolution — what this controller used to do — cannot work for its main
 * caller: the dashboard's `@booking/api-client` sends `cookie` +
 * `x-tenant-id`/`x-partner-id`/`x-affiliate-tenant` and never a tenant host, so
 * axios' own `Host` (dev `localhost:3000`, staging the internal API host) maps
 * to no `tenant_domains` row and every call 404'd. Only the storefront forwards
 * `x-forwarded-host`, which is why `GET /me/legal/acceptances` appeared to work
 * while the whole partner/affiliate re-acceptance flow was inert.
 *
 * So the scope headers the dashboard already sends are the primary input, and
 * Host is the fallback for storefront callers. Verification mirrors
 * `PermissionsGuard`: the header only NAMES a scope, and
 * `IPermissionResolver.resolve` answers it from `role_assignments` — a client
 * can never grant itself one.
 *
 * `x-affiliate-tenant` is the one input that cannot be verified here.
 * Affiliates are membership-gated, not RBAC (`AffiliateController`'s docblock),
 * so they hold no role assignment, and the `affiliates` table belongs to a
 * module `legal` may not import — `affiliate` already imports `legal`'s guard,
 * so the reverse edge is the cycle `pnpm check:module-cycles` exists to catch.
 * It is therefore treated as a selector over a tenant that must exist, which is
 * safe on exactly these three routes: every query underneath is narrowed to
 * `user_id = <the caller>`, and the only tenant-owned data reachable is
 * published legal text that `GET /public/legal` already serves anonymously. The
 * worst a forged value achieves is recording that the caller agreed to a
 * stranger's published terms.
 */
@Injectable()
export class ResolveLegalCallerScopeUseCase {
  constructor(
    @Inject(PERMISSION_RESOLVER) private readonly permissions: IPermissionResolver,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly resolveTenantByHost: ResolveTenantByHostUseCase,
  ) {}

  async execute(input: LegalCallerScopeInput): Promise<LegalCallerScope> {
    const tenantIdHeader = uuidOrNull(input.tenantIdHeader);
    const partnerIdHeader = uuidOrNull(input.partnerIdHeader);
    const affiliateTenant = uuidOrNull(input.affiliateTenantHeader);

    if (tenantIdHeader) {
      if (partnerIdHeader) {
        const held = await this.permissions.resolve(input.userId, {
          tenantId: tenantIdHeader,
          partnerId: partnerIdHeader,
        });
        if (held.size > 0) {
          return { tenantId: tenantIdHeader, partnerId: partnerIdHeader, scopes: ['partner'] };
        }
      }
      const held = await this.permissions.resolve(input.userId, { tenantId: tenantIdHeader });
      if (held.size > 0) {
        // A tenant-scope caller (owner/staff) is never gated on partner or
        // affiliate terms — they are the counterparty, not the signatory.
        return { tenantId: tenantIdHeader, partnerId: null, scopes: [] };
      }
    }

    if (affiliateTenant) {
      const tenant = await this.tenants.findById(affiliateTenant);
      if (!tenant) throw new TenantNotFound();
      return { tenantId: affiliateTenant, partnerId: null, scopes: ['affiliate'] };
    }

    const tenant = await this.resolveTenantByHost.execute(this.hostOf(input.forwardedHost, input.host));
    // A host-resolved caller is a storefront customer: customers are never
    // blocked (design §Re-acceptance), so no gate applies to them.
    return { tenantId: tenant.id, partnerId: null, scopes: [] };
  }

  /** Same rule as `PublicTenantController.tenant()` — the visitor's Host, forwarded-first. */
  private hostOf(forwardedHost?: string, host?: string): string {
    const resolved = forwardedHost?.split(',')[0]?.trim() || host;
    if (!resolved) throw new MissingTenantHost();
    return resolved;
  }
}

/** A malformed header is treated as absent — Prisma would throw on a non-uuid. */
function uuidOrNull(raw?: string): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return uuidSchema.safeParse(trimmed).success ? trimmed : null;
}
