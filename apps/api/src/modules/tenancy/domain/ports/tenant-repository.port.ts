import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

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
  list(params: ListTenantsParams): Promise<{ items: TenantRecord[]; total: number }>;
  update(id: string, data: UpdateTenantData): Promise<TenantRecord>;
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
