import type { ScopeMembership, SessionInfoResponse } from '@booking/contracts';
import { dashboardPaths } from '~/constants/paths';

export type TenantMembership = ScopeMembership & { scope: 'tenant'; tenantId: string };
export type PartnerMembership = ScopeMembership & {
  scope: 'partner';
  tenantId: string;
  partnerId: string;
};

export function firstTenantMembership(info: SessionInfoResponse): TenantMembership | null {
  const tenant = info.scopes.find(
    (item): item is TenantMembership => item.scope === 'tenant' && Boolean(item.tenantId),
  );
  return tenant ?? null;
}

export function firstPartnerMembership(info: SessionInfoResponse): PartnerMembership | null {
  const partner = info.scopes.find(
    (item): item is PartnerMembership =>
      item.scope === 'partner' && Boolean(item.tenantId) && Boolean(item.partnerId),
  );
  return partner ?? null;
}

export function defaultDashboardPath(info: SessionInfoResponse): string {
  if (info.scopes.some((membership) => membership.scope === 'platform')) {
    return dashboardPaths.admin.home;
  }
  const tenant = firstTenantMembership(info);
  if (tenant) return dashboardPaths.tenant.home;
  const partner = firstPartnerMembership(info);
  if (partner) return dashboardPaths.partner.home;
  return dashboardPaths.home;
}
