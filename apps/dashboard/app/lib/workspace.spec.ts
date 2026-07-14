import { describe, expect, it } from 'vitest';
import type { SessionInfoResponse } from '@booking/contracts';
import { dashboardPaths } from './paths';
import {
  defaultDashboardPath,
  findPartnerMembership,
  findTenantMembership,
  preferredPartnerMembership,
  preferredTenantMembership,
} from './workspace';
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
  it('builds scoped tenant and partner paths', () => {
    expect(dashboardPaths.tenant.bookings(tenantB)).toBe(`/tenant/${tenantB}/bookings`);
    expect(dashboardPaths.partner.calendar(partnerB)).toBe(`/partner/${partnerB}/calendar`);
  });

  it('selects only the membership matching the URL id', () => {
    expect(findTenantMembership(info, tenantB)?.permissions).toEqual([
      'tenant.theme.manage',
    ]);
    expect(findTenantMembership(info, 'missing')).toBeNull();
    expect(findPartnerMembership(info, partnerB)?.tenantId).toBe(tenantB);
  });

  it('uses an explicit workspace id for the default landing page', () => {
    expect(defaultDashboardPath(info)).toBe(dashboardPaths.tenant.home(tenantA));
  });

  it('preserves the current workspace for compatibility redirects', () => {
    expect(preferredTenantMembership(info, `/tenant/${tenantB}/bookings`)?.tenantId).toBe(
      tenantB,
    );
    expect(preferredPartnerMembership(info, `/partner/${partnerB}/calendar`)?.partnerId).toBe(
      partnerB,
    );
  });

  it('builds navigation from only the active membership permissions', () => {
    const areas = dashboardAreasFor(info, dashboardPaths.tenant.home(tenantB));
    const tenantArea = areas.find((area) => area.scope === 'tenant');

    expect(tenantArea?.basePath).toBe(dashboardPaths.tenant.home(tenantB));
    expect(tenantArea?.items.map((item) => item.to)).toContain(
      dashboardPaths.tenant.settings(tenantB),
    );
    expect(tenantArea?.items.map((item) => item.to)).not.toContain(
      dashboardPaths.tenant.bookings(tenantB),
    );
  });
});
