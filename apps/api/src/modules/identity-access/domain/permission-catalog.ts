import { partnerPermissionKeySchema, tenantPermissionKeySchema, type ScopeLevel } from '@booking/contracts';

/**
 * Fixed permission catalog (TONG-QUAN.md §14.2) — seeded from code, never
 * creatable via UI. Keys follow `scope.resource.action`.
 */
const TENANT_KEYS = tenantPermissionKeySchema.options.map(
  (key): { key: string; scopeLevel: ScopeLevel } => ({ key, scopeLevel: 'tenant' }),
);

const PARTNER_KEYS = partnerPermissionKeySchema.options.map(
  (key): { key: string; scopeLevel: ScopeLevel } => ({ key, scopeLevel: 'partner' }),
);

export const PERMISSION_CATALOG: ReadonlyArray<{ key: string; scopeLevel: ScopeLevel }> = [
  // Platform
  { key: 'platform.tenants.read', scopeLevel: 'platform' },
  { key: 'platform.tenants.write', scopeLevel: 'platform' },
  { key: 'platform.plans.manage', scopeLevel: 'platform' },
  { key: 'platform.subscriptions.manage', scopeLevel: 'platform' },
  { key: 'platform.finance.read', scopeLevel: 'platform' },
  /// Set a tenant's platform fee %. Deliberately NOT granted to Support — changing
  /// a commercial term is not a support action.
  { key: 'platform.finance.manage', scopeLevel: 'platform' },
  { key: 'platform.refunds.break_glass', scopeLevel: 'platform' },
  { key: 'platform.users.manage', scopeLevel: 'platform' },
  { key: 'platform.roles.manage', scopeLevel: 'platform' },
  { key: 'platform.reviews.read', scopeLevel: 'platform' },
  { key: 'platform.disputes.read', scopeLevel: 'platform' },
  // Tenant
  ...TENANT_KEYS,
  // Partner
  ...PARTNER_KEYS,
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
    permissions: [
      'platform.tenants.read',
      'platform.finance.read',
      'platform.reviews.read',
      'platform.disputes.read',
    ],
  },
  { name: 'Tenant Owner', scopeLevel: 'tenant', permissions: keysOf('tenant') },
  {
    name: 'Manager',
    scopeLevel: 'tenant',
    permissions: keysOf('tenant').filter(
      (k) =>
        k !== 'tenant.roles.manage' &&
        k !== 'tenant.settings.manage' &&
        k !== 'tenant.legal.manage',
    ),
  },
  {
    name: 'Finance',
    scopeLevel: 'tenant',
    permissions: [
      'tenant.finance.read',
      'tenant.payouts.manage',
      'tenant.refunds.prepare',
      'tenant.refunds.approve',
      'tenant.refunds.reveal',
      'tenant.reports.read',
      'tenant.disputes.read',
      'tenant.disputes.resolve',
    ],
  },
  { name: 'Partner Owner', scopeLevel: 'partner', permissions: keysOf('partner') },
  {
    name: 'Staff',
    scopeLevel: 'partner',
    permissions: [
      'partner.bookings.read',
      // Annotating a booking is strictly weaker than the approve/reject Staff already has.
      'partner.bookings.write',
      'partner.bookings.approve',
      'partner.availability.manage',
      'partner.disputes.read',
      'partner.disputes.respond',
    ],
  },
];
