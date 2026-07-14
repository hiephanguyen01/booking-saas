import type { ScopeMembership, SessionInfoResponse } from '@booking/contracts';
import { dashboardPaths } from './paths';

export type TenantMembership = ScopeMembership & { scope: 'tenant'; tenantId: string };
export type PartnerMembership = ScopeMembership & {
  scope: 'partner';
  tenantId: string;
  partnerId: string;
};

export function findTenantMembership(
  info: SessionInfoResponse,
  tenantId: string,
): TenantMembership | null {
  const membership = info.scopes.find(
    (item) => item.scope === 'tenant' && item.tenantId === tenantId,
  );
  return membership?.tenantId
    ? ({ ...membership, scope: 'tenant', tenantId: membership.tenantId } as TenantMembership)
    : null;
}

export function findPartnerMembership(
  info: SessionInfoResponse,
  partnerId: string,
): PartnerMembership | null {
  const membership = info.scopes.find(
    (item) => item.scope === 'partner' && item.partnerId === partnerId,
  );
  return membership?.tenantId && membership.partnerId
    ? ({
        ...membership,
        scope: 'partner',
        tenantId: membership.tenantId,
        partnerId: membership.partnerId,
      } as PartnerMembership)
    : null;
}

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
