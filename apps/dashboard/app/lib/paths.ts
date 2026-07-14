function segment(value: string): string {
  return encodeURIComponent(value);
}

function tenantPath(suffix = ''): string {
  return `/tenant${suffix}`;
}

function partnerPath(suffix = ''): string {
  return `/partner${suffix}`;
}

export const dashboardPaths = {
  home: '/',
  workspaces: '/workspaces',
  auth: { login: '/auth/login', logout: '/auth/logout' },
  admin: { home: '/admin', tenants: '/admin/tenants' },
  tenant: {
    home: tenantPath(),
    listings: tenantPath('/listings'),
    listingGroups: tenantPath('/listing-groups'),
    listingTypes: tenantPath('/listing-types'),
    partners: tenantPath('/partners'),
    bookings: tenantPath('/bookings'),
    booking: (bookingId: string) => tenantPath(`/bookings/${segment(bookingId)}`),
    finance: tenantPath('/finance'),
    ledger: tenantPath('/finance/ledger'),
    promotions: tenantPath('/promotions'),
    affiliates: tenantPath('/affiliates'),
    settings: tenantPath('/settings'),
  },
  partner: {
    home: partnerPath(),
    calendar: partnerPath('/calendar'),
    bookings: partnerPath('/bookings'),
    listings: partnerPath('/listings'),
    promotions: partnerPath('/promotions'),
    revenue: partnerPath('/revenue'),
    profile: partnerPath('/profile'),
  },
} as const;
