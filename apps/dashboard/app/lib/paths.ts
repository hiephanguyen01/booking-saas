function segment(value: string): string {
  return encodeURIComponent(value);
}

function tenantPath(tenantId: string, suffix = ''): string {
  return `/tenant/${segment(tenantId)}${suffix}`;
}

function partnerPath(partnerId: string, suffix = ''): string {
  return `/partner/${segment(partnerId)}${suffix}`;
}

export const dashboardPaths = {
  home: '/',
  workspaces: '/workspaces',
  auth: { login: '/auth/login', logout: '/auth/logout' },
  admin: { home: '/admin', tenants: '/admin/tenants' },
  tenant: {
    home: (tenantId: string) => tenantPath(tenantId),
    listings: (tenantId: string) => tenantPath(tenantId, '/listings'),
    listingGroups: (tenantId: string) => tenantPath(tenantId, '/listing-groups'),
    listingTypes: (tenantId: string) => tenantPath(tenantId, '/listing-types'),
    partners: (tenantId: string) => tenantPath(tenantId, '/partners'),
    bookings: (tenantId: string) => tenantPath(tenantId, '/bookings'),
    booking: (tenantId: string, bookingId: string) =>
      tenantPath(tenantId, `/bookings/${segment(bookingId)}`),
    finance: (tenantId: string) => tenantPath(tenantId, '/finance'),
    ledger: (tenantId: string) => tenantPath(tenantId, '/finance/ledger'),
    promotions: (tenantId: string) => tenantPath(tenantId, '/promotions'),
    affiliates: (tenantId: string) => tenantPath(tenantId, '/affiliates'),
    settings: (tenantId: string) => tenantPath(tenantId, '/settings'),
  },
  partner: {
    home: (partnerId: string) => partnerPath(partnerId),
    calendar: (partnerId: string) => partnerPath(partnerId, '/calendar'),
    bookings: (partnerId: string) => partnerPath(partnerId, '/bookings'),
    listings: (partnerId: string) => partnerPath(partnerId, '/listings'),
    revenue: (partnerId: string) => partnerPath(partnerId, '/revenue'),
    profile: (partnerId: string) => partnerPath(partnerId, '/profile'),
  },
} as const;
