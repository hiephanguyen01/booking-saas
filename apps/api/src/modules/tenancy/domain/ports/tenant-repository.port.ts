import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'expired';
  vertical: string;
  defaultTimezone: string;
  defaultLocale: string;
  themeConfig: Record<string, unknown>;
  settings: Record<string, unknown>;
  /** Tenant-level fallback cancellation policy (§11.3); null = no tenant default. */
  defaultCancellationPolicyId: string | null;
  /**
   * Stamped by the legal-readiness outbox handler when all four required
   * documents are published in the tenant's defaultLocale; null otherwise.
   * The storefront hard gate keys on this being non-null.
   */
  legalReadyAt: Date | null;
  /** How many of the four required documents are published in defaultLocale (0-4). */
  legalDocumentsReady: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Filters for the platform-admin tenant list. All optional and ANDed. */
export interface ListTenantsParams {
  page: number;
  pageSize: number;
  /** Case-insensitive partial match on name or slug. */
  search?: string;
  status?: 'active' | 'suspended' | 'expired';
  vertical?: string;
}

export interface CreateTenantData {
  name: string;
  slug: string;
  vertical: string;
  defaultTimezone: string;
  defaultLocale: string;
}

export interface UpdateTenantData {
  name?: string;
  vertical?: string;
  defaultTimezone?: string;
  defaultLocale?: string;
  status?: 'active' | 'suspended' | 'expired';
  themeConfig?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  /** null clears the tenant default; a value must reference a tenant-level policy of this tenant. */
  defaultCancellationPolicyId?: string | null;
}

/**
 * Platform-admin repository for tenants. Runs on the BYPASSRLS admin pool —
 * tenant management is cross-tenant and has no tenant context (§6.3).
 */
export interface ITenantRepository {
  create(data: CreateTenantData, tx?: PrismaTx): Promise<TenantRecord>;
  /**
   * Runs `fn` inside one admin-pool (BYPASSRLS) transaction so a multi-table
   * platform-admin write — e.g. a tenant + its primary domain — commits
   * atomically and never leaves an orphan row.
   */
  runInTransaction<T>(fn: (tx: PrismaTx) => Promise<T>): Promise<T>;
  findById(id: string): Promise<TenantRecord | null>;
  findBySlug(slug: string): Promise<TenantRecord | null>;
  list(params: ListTenantsParams): Promise<RepoPage<TenantRecord>>;
  update(id: string, data: UpdateTenantData): Promise<TenantRecord>;
  /**
   * Stamps or clears the legal-readiness marker. Separate from `update()`
   * because the only writer is the legal-readiness outbox handler, never the
   * platform-admin tenant form.
   */
  setLegalReadiness(tenantId: string, at: Date | null, publishedCount: number): Promise<void>;
  /** True when `policyId` is a tenant-level (partner_id null) cancellation policy of this tenant. */
  isTenantLevelPolicy(tenantId: string, policyId: string): Promise<boolean>;
  countPartners(tenantId: string): Promise<number>;
  countListings(tenantId: string): Promise<number>;
  /**
   * Read-only count of the tenant's booking rows in a window. Tenancy owns this
   * (rather than asking the booking module) precisely so it never has to import a
   * booking service: it is a plain aggregate over a column tenancy already
   * filters on, and it is what backs the §6.5 soft monthly quota.
   */
  countBookingsBetween(tenantId: string, from: Date, to: Date): Promise<number>;
}
