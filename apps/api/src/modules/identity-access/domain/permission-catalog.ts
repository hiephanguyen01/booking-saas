import type { ScopeLevel } from '@booking/shared';

/**
 * Fixed permission catalog (TONG-QUAN.md §14.2) — seeded from code, never
 * creatable via UI. Keys follow `scope.resource.action`.
 */
export const PERMISSION_CATALOG: ReadonlyArray<{ key: string; scopeLevel: ScopeLevel }> = [
  // Platform
  { key: 'platform.tenants.read', scopeLevel: 'platform' },
  { key: 'platform.tenants.write', scopeLevel: 'platform' },
  { key: 'platform.plans.manage', scopeLevel: 'platform' },
  { key: 'platform.subscriptions.manage', scopeLevel: 'platform' },
  { key: 'platform.finance.read', scopeLevel: 'platform' },
  { key: 'platform.users.manage', scopeLevel: 'platform' },
  { key: 'platform.roles.manage', scopeLevel: 'platform' },
  // Tenant
  { key: 'tenant.settings.manage', scopeLevel: 'tenant' },
  { key: 'tenant.theme.manage', scopeLevel: 'tenant' },
  { key: 'tenant.partners.approve', scopeLevel: 'tenant' },
  { key: 'tenant.listings.read', scopeLevel: 'tenant' },
  { key: 'tenant.listings.write', scopeLevel: 'tenant' },
  { key: 'tenant.listings.publish', scopeLevel: 'tenant' },
  { key: 'tenant.bookings.read', scopeLevel: 'tenant' },
  { key: 'tenant.bookings.manage', scopeLevel: 'tenant' },
  { key: 'tenant.bookings.cancel', scopeLevel: 'tenant' },
  { key: 'tenant.commissions.manage', scopeLevel: 'tenant' },
  { key: 'tenant.promotions.manage', scopeLevel: 'tenant' },
  { key: 'tenant.finance.read', scopeLevel: 'tenant' },
  { key: 'tenant.payouts.manage', scopeLevel: 'tenant' },
  { key: 'tenant.affiliates.manage', scopeLevel: 'tenant' },
  { key: 'tenant.members.manage', scopeLevel: 'tenant' },
  { key: 'tenant.roles.manage', scopeLevel: 'tenant' },
  { key: 'tenant.reports.read', scopeLevel: 'tenant' },
  // Partner
  { key: 'partner.listings.read', scopeLevel: 'partner' },
  { key: 'partner.listings.write', scopeLevel: 'partner' },
  { key: 'partner.listings.publish', scopeLevel: 'partner' },
  { key: 'partner.bookings.read', scopeLevel: 'partner' },
  { key: 'partner.bookings.approve', scopeLevel: 'partner' },
  { key: 'partner.bookings.cancel', scopeLevel: 'partner' },
  { key: 'partner.availability.manage', scopeLevel: 'partner' },
  { key: 'partner.promotions.manage', scopeLevel: 'partner' }, // enforced from Phase 2
  { key: 'partner.finance.read', scopeLevel: 'partner' },
  { key: 'partner.members.manage', scopeLevel: 'partner' },
  { key: 'partner.roles.manage', scopeLevel: 'partner' },
];

const keysOf = (scope: ScopeLevel) =>
  PERMISSION_CATALOG.filter((p) => p.scopeLevel === scope).map((p) => p.key);

/** Pre-seeded system roles (§14.3), `is_system = true`, shared across tenants. */
export const SYSTEM_ROLES: ReadonlyArray<{
  name: string;
  scopeLevel: ScopeLevel;
  permissions: string[];
}> = [
  { name: 'Super Admin', scopeLevel: 'platform', permissions: keysOf('platform') },
  {
    name: 'Support',
    scopeLevel: 'platform',
    permissions: ['platform.tenants.read', 'platform.finance.read'],
  },
  { name: 'Tenant Owner', scopeLevel: 'tenant', permissions: keysOf('tenant') },
  {
    name: 'Manager',
    scopeLevel: 'tenant',
    permissions: keysOf('tenant').filter(
      (k) => k !== 'tenant.roles.manage' && k !== 'tenant.settings.manage',
    ),
  },
  {
    name: 'Finance',
    scopeLevel: 'tenant',
    permissions: ['tenant.finance.read', 'tenant.payouts.manage', 'tenant.reports.read'],
  },
  { name: 'Partner Owner', scopeLevel: 'partner', permissions: keysOf('partner') },
  {
    name: 'Staff',
    scopeLevel: 'partner',
    permissions: ['partner.bookings.read', 'partner.bookings.approve', 'partner.availability.manage'],
  },
];
