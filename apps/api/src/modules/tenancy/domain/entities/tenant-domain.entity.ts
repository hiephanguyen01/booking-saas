import { buildVerificationToken } from '../hostname';
import {
  DomainNotVerifiable,
  DomainNotVerified,
  DomainPrimaryRequired,
} from '../errors/tenancy-errors';

/**
 * TenantDomain aggregate (§6.3) — one hostname mapped to one tenant, plus the
 * portfolio-level rules that need its siblings.
 *
 * Owns:
 *   - provisioning: the platform-owned `<slug>.<baseDomain>` subdomain is trusted, so
 *     it is born verified with no token ({@link TenantDomain.provisionDefaultSubdomain});
 *     a custom domain is born unverified with a `bookify-verify=…` TXT token
 *     ({@link TenantDomain.requestCustomDomain});
 *   - the verification gate ({@link TenantDomain.assertVerifiable}) and the
 *     already-verified short-circuit ({@link TenantDomain.isVerified});
 *   - the primary-election gate ({@link TenantDomain.assertCanBecomePrimary});
 *   - the portfolio rule that the last verified domain cannot be deleted
 *     ({@link assertDeletableFromPortfolio}).
 *
 * NOT owned here (deliberately):
 *   - the atomic clear-old/set-new primary swap — it stays a two-statement
 *     transaction in the repository (spec §3 "CAS ở lại repository"); reconstructing
 *     it from aggregate state would race, and there is no DB constraint to catch that;
 *   - hostname uniqueness (citext unique index; the pre-check is advisory);
 *   - randomness and clocks — the caller supplies `randomHex` and `now`.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** The persisted write-state of one domain row. */
export interface TenantDomainState {
  id: string;
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  verificationToken: string | null;
  verifiedAt: Date | null;
}

/** Validated insert payload (id assigned by the DB). */
export interface NewTenantDomain {
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  verificationToken: string | null;
  verifiedAt: Date | null;
}

export class TenantDomain {
  private constructor(private readonly state: TenantDomainState) {}

  static rehydrate(state: TenantDomainState): TenantDomain {
    return new TenantDomain(state);
  }

  /** The `<slug>.<baseDomain>` subdomain we own: primary and verified from birth. */
  static provisionDefaultSubdomain(input: {
    tenantId: string;
    hostname: string;
    now: Date;
  }): NewTenantDomain {
    return {
      tenantId: input.tenantId,
      hostname: input.hostname,
      isPrimary: true,
      verificationToken: null,
      verifiedAt: input.now,
    };
  }

  /**
   * A customer-owned hostname: unverified until the TXT record shows up.
   * NOTE: `isPrimary` is taken from the caller as-is — today the API lets a request
   * set it without clearing an existing primary, which is a recorded known gap; this
   * factory preserves that behaviour rather than silently tightening it.
   */
  static requestCustomDomain(input: {
    tenantId: string;
    hostname: string;
    isPrimary: boolean;
    randomHex: string;
  }): NewTenantDomain {
    return {
      tenantId: input.tenantId,
      hostname: input.hostname,
      isPrimary: input.isPrimary,
      verificationToken: buildVerificationToken(input.randomHex),
      verifiedAt: null,
    };
  }

  get id(): string {
    return this.state.id;
  }

  get hostname(): string {
    return this.state.hostname;
  }

  get isVerified(): boolean {
    return this.state.verifiedAt !== null;
  }

  get isPrimary(): boolean {
    return this.state.isPrimary;
  }

  get belongsToTenant(): string {
    return this.state.tenantId;
  }

  /** A domain with no token has nothing to check against — verification is impossible. */
  assertVerifiable(): void {
    if (this.state.verificationToken === null) throw new DomainNotVerifiable();
  }

  /** Only a verified domain may carry the storefront. */
  assertCanBecomePrimary(): void {
    if (!this.isVerified) throw new DomainNotVerified();
  }
}

/**
 * Portfolio rule: removing a verified primary domain is refused while it is the
 * tenant's only verified one — a live storefront must never be orphaned.
 *
 * NOTE the asymmetry, preserved from the pre-refactor code: siblings are filtered by
 * `verified`, NOT by `primary`. So deleting the primary while another verified (but
 * non-primary) domain exists succeeds and leaves the tenant with no primary at all.
 * Recorded as a known gap rather than tightened here.
 *
 * The second parameter is the tenant's FULL domain list; the target is excluded internally,
 * so callers cannot get the contract wrong.
 */
export function assertDeletableFromPortfolio(
  target: { id: string; isPrimary: boolean; isVerified: boolean },
  allTenantDomains: readonly { id: string; isVerified: boolean }[],
): void {
  if (!target.isPrimary || !target.isVerified) return;
  const otherVerified = allTenantDomains.some((d) => d.id !== target.id && d.isVerified);
  if (otherVerified) return;
  throw new DomainPrimaryRequired();
}
