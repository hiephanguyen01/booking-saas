import { describe, expect, it } from 'vitest';
import type { SessionInfoResponse } from '@booking/contracts';
import { dashboardPaths } from './paths';
import { defaultDashboardPath, findPartnerMembership, findTenantMembership } from './workspace';
import { dashboardAreasFor } from './navigation';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const partnerB = '33333333-3333-4333-8333-333333333333';

const info: SessionInfoResponse = {
  user: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'owner@example.com',
    fullName: 'Owner',
    phone: null,
    locale: 'vi',
    status: 'active',
  },
  scopes: [
    {
      scope: 'tenant',
      tenantId: tenantA,
      tenantName: 'Tenant A',
      partnerId: null,
      partnerName: null,
      roles: ['viewer'],
      permissions: ['tenant.bookings.read'],
    },
    {
      scope: 'tenant',
      tenantId: tenantB,
      tenantName: 'Tenant B',
      partnerId: null,
      partnerName: null,
      roles: ['owner'],
      permissions: ['tenant.theme.manage'],
    },
    {
      scope: 'partner',
      tenantId: tenantB,
      tenantName: 'Tenant B',
      partnerId: partnerB,
      partnerName: 'Partner B',
      roles: ['owner'],
      permissions: ['partner.bookings.read'],
    },
  ],
};

describe('dashboard workspace routing', () => {
  it('builds tenant and partner paths without workspace ids', () => {
    expect(dashboardPaths.tenant.bookings).toBe('/tenant/bookings');
    expect(dashboardPaths.partner.calendar).toBe('/partner/calendar');
  });

  it('finds memberships by id for scoped API authentication', () => {
    expect(findTenantMembership(info, tenantB)?.permissions).toEqual(['tenant.theme.manage']);
    expect(findTenantMembership(info, 'missing')).toBeNull();
    expect(findPartnerMembership(info, partnerB)?.tenantId).toBe(tenantB);
  });

  it('uses the tenant area for the default landing page', () => {
    expect(defaultDashboardPath(info)).toBe(dashboardPaths.tenant.home);
  });

  it('builds navigation from only the active membership permissions', () => {
    const areas = dashboardAreasFor(info, dashboardPaths.tenant.home);
    const tenantArea = areas.find((area) => area.scope === 'tenant');

    expect(tenantArea?.basePath).toBe(dashboardPaths.tenant.home);
    expect(tenantArea?.items.map((item) => item.to)).toContain(dashboardPaths.tenant.bookings);
    expect(tenantArea?.items.map((item) => item.to)).not.toContain(dashboardPaths.tenant.settings);
  });
});
