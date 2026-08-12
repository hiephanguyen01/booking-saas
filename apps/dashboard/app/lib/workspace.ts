import type { ScopeMembership, SessionInfoResponse } from '@booking/contracts';
import type { DashboardHostResolution } from './tenant-host.server';
import { dashboardPaths } from '~/constants/paths';

export type TenantMembership = ScopeMembership & { scope: 'tenant'; tenantId: string };
export type PartnerMembership = ScopeMembership & {
  scope: 'partner';
  tenantId: string;
  partnerId: string;
};

export function tenantMembership(
  info: SessionInfoResponse,
  tenantId: string,
): TenantMembership | null {
  const tenant = info.scopes.find(
    (item): item is TenantMembership => item.scope === 'tenant' && item.tenantId === tenantId,
  );
  return tenant ?? null;
}

export function partnerMembershipIn(
  info: SessionInfoResponse,
  tenantId: string,
): PartnerMembership | null {
  const partner = info.scopes.find(
    (item): item is PartnerMembership =>
      item.scope === 'partner' && item.tenantId === tenantId && Boolean(item.partnerId),
  );
  return partner ?? null;
}

export function tenantMemberships(info: SessionInfoResponse): TenantMembership[] {
  return info.scopes.filter(
    (item): item is TenantMembership => item.scope === 'tenant' && Boolean(item.tenantId),
  );
}

export function partnerMemberships(info: SessionInfoResponse): PartnerMembership[] {
  return info.scopes.filter(
    (item): item is PartnerMembership =>
      item.scope === 'partner' && Boolean(item.tenantId) && Boolean(item.partnerId),
  );
}

export function defaultDashboardPath(
  info: SessionInfoResponse,
  host: DashboardHostResolution,
): string {
  // On the platform host only `/admin` exists. Everyone else belongs on a tenant
  // console host, so the directory is the honest landing — it is the only page
  // here that can tell them where to go.
  if (host.kind === 'platform') {
    return info.scopes.some((membership) => membership.scope === 'platform')
      ? dashboardPaths.admin.home
      : dashboardPaths.workspaces;
  }
  // `unknown-host` never reaches here in practice — the root middleware 404s it
  // before any loader runs — but the type still carries it, so it falls back to
  // the same "no access" landing a tenant host would show for a bare account.
  if (host.kind !== 'tenant') return dashboardPaths.home;
  const tenant = tenantMembership(info, host.tenant.id);
  if (tenant) return dashboardPaths.tenant.home;
  const partner = partnerMembershipIn(info, host.tenant.id);
  if (partner) return dashboardPaths.partner.home;
  return dashboardPaths.home;
}
