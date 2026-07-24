import type { CancellationTier } from '@booking/contracts';
import {
  CancellationPolicyInUse,
  CancellationPolicyNotOwnedForDelete,
  CancellationPolicyNotOwnedForEdit,
  CancellationPolicyNotTenantOwnedForDelete,
  CancellationPolicyNotTenantOwnedForEdit,
} from '../errors/cancellation-policy-errors';

/**
 * CancellationPolicy aggregate (§11.3) — a named set of refund tiers a
 * partner (or the tenant, as a shared fallback) attaches to listings. A
 * policy with `partnerId: null` is tenant-level and shared; one with a
 * `partnerId` is owned by that partner alone.
 *
 * Owns the four ownership gates that used to sit inline, one per
 * (path × action) pair, each with its own message even though edit/delete
 * share a code with their sibling:
 *   - {@link CancellationPolicy.assertOwnedByPartner} — partner-path edit,
 *     `CancellationPolicyNotOwnedForEdit`.
 *   - {@link CancellationPolicy.assertDeletableByPartner} — partner-path
 *     delete, `CancellationPolicyNotOwnedForDelete`.
 *   - {@link CancellationPolicy.assertTenantOwnedForEdit} — tenant-path edit,
 *     `CancellationPolicyNotTenantOwnedForEdit`.
 *   - {@link CancellationPolicy.assertTenantOwnedForDelete} — tenant-path
 *     delete, `CancellationPolicyNotTenantOwnedForDelete`.
 * Plus the shared delete guard {@link CancellationPolicy.assertNotInUse}
 * (both paths count listings still pointing at the policy the same way and
 * hand the count in).
 *
 * NOT owned here (deliberately): the default-policy pointer (`isDefault`)
 * lives on the partner/tenant row, not this aggregate — `findPartnerDefaultId`
 * / `findTenantDefaultId` stay repository lookups the use-case resolves
 * separately to build the response. The "still in use" count itself is also
 * resolved by the use-case (`ICancellationPolicyRepository.countListingsUsing`)
 * and handed to `assertNotInUse` as a plain number; this aggregate never
 * counts anything itself.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** The persisted write-state these rules need. */
export interface CancellationPolicyState {
  id: string;
  /** null ⇒ tenant-level shared policy; set ⇒ owned by this partner. */
  partnerId: string | null;
  name: string;
  rules: CancellationTier[];
}

/** Validated insert payload (id/tenantId/createdAt/updatedAt assigned by the DB). */
export interface NewCancellationPolicy {
  partnerId: string | null;
  name: string;
  rules: CancellationTier[];
}

/** The diff to persist — an omitted key means "leave the stored value alone". */
export interface CancellationPolicyPatch {
  name?: string;
  rules?: CancellationTier[];
}

export class CancellationPolicy {
  private constructor(private readonly state: CancellationPolicyState) {}

  /** Rehydrate for the update / delete paths. */
  static rehydrate(state: CancellationPolicyState): CancellationPolicy {
    return new CancellationPolicy(state);
  }

  /** Assemble a new policy. Passthrough — `partnerId` is forced by the caller
   *  (the partner-path create use-case), never derived here. */
  static open(input: {
    partnerId: string | null;
    name: string;
    rules: CancellationTier[];
  }): NewCancellationPolicy {
    return { partnerId: input.partnerId, name: input.name, rules: input.rules };
  }

  /** Partner-path edit gate: only the owning partner may edit their policy. */
  assertOwnedByPartner(partnerId: string): void {
    if (this.state.partnerId !== partnerId) throw new CancellationPolicyNotOwnedForEdit();
  }

  /** Partner-path delete gate: only the owning partner may delete their policy. */
  assertDeletableByPartner(partnerId: string): void {
    if (this.state.partnerId !== partnerId) throw new CancellationPolicyNotOwnedForDelete();
  }

  /** Tenant-path edit gate: partner-owned policies are read-only to tenant settings. */
  assertTenantOwnedForEdit(): void {
    if (this.state.partnerId !== null) throw new CancellationPolicyNotTenantOwnedForEdit();
  }

  /** Tenant-path delete gate: partner-owned policies cannot be deleted from tenant settings. */
  assertTenantOwnedForDelete(): void {
    if (this.state.partnerId !== null) throw new CancellationPolicyNotTenantOwnedForDelete();
  }

  /** Shared delete guard: refuse while any listing still points at this policy
   *  directly. `inUse` is resolved by the use-case and handed in. */
  assertNotInUse(inUse: number): void {
    if (inUse > 0) throw new CancellationPolicyInUse(inUse);
  }

  /** Merge a PATCH, returning exactly the keys supplied — an omitted key stays
   *  `undefined`, which `ICancellationPolicyRepository.update` treats as
   *  "leave untouched". Mirrors what `update-cancellation-policy.use-case.ts`
   *  (and its tenant-path sibling) already pass through today. */
  applyUpdate(input: { name?: string; rules?: CancellationTier[] }): CancellationPolicyPatch {
    return { name: input.name, rules: input.rules };
  }
}
