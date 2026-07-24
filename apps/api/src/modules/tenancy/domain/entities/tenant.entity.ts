import { InvalidCancellationPolicy } from '../errors/tenancy-errors';

/**
 * Tenant aggregate root (§6) — one business on the platform: profile, lifecycle
 * status, theme, and the settings blob the dashboard toggles.
 *
 * Owns the two write rules that used to sit inline in use-cases:
 *   - toggling `settings.partnerPromotionsEnabled` must MERGE, never replace, so
 *     unrelated settings keys survive ({@link Tenant.togglePartnerPromotions});
 *   - the default cancellation policy must be a tenant-level policy of this very
 *     tenant ({@link Tenant.setDefaultCancellationPolicy}) — the ownership fact is
 *     resolved by the repository and handed in.
 *
 * NOT owned here (deliberately): slug uniqueness (DB unique index + advisory
 * pre-check), status transitions (there are none today — any→any is accepted, a
 * recorded known gap), and storefront liveness, which composes the tenant status
 * with the subscription evaluation on the read path.
 *
 * Framework-free: no Nest, no Prisma.
 */
export type TenantStatus = 'active' | 'suspended' | 'expired';

/** The persisted write-state these rules need. */
export interface TenantState {
  id: string;
  status: TenantStatus;
  settings: Record<string, unknown>;
  defaultCancellationPolicyId: string | null;
}

export class Tenant {
  private constructor(private readonly state: TenantState) {}

  static rehydrate(state: TenantState): Tenant {
    return new Tenant(state);
  }

  get id(): string {
    return this.state.id;
  }

  /**
   * Merge-not-replace: the settings column is a shared blob, so a toggle must
   * preserve every key it does not own.
   */
  togglePartnerPromotions(enabled: boolean): { settings: Record<string, unknown> } {
    return { settings: { ...this.state.settings, partnerPromotionsEnabled: enabled } };
  }

  /**
   * `null` clears the default. A non-null id must belong to this tenant AND be
   * tenant-level (partner_id null) — the repository answers that question.
   */
  setDefaultCancellationPolicy(
    policyId: string | null,
    isTenantLevelPolicy: boolean,
  ): { defaultCancellationPolicyId: string | null } {
    if (policyId !== null && !isTenantLevelPolicy) throw new InvalidCancellationPolicy();
    return { defaultCancellationPolicyId: policyId };
  }
}
