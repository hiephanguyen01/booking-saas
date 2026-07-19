// The single source of route URLs for the dashboard (all four areas).
// nav.ts files, redirects, and <Link to> builders consume this — never
// hardcode an area URL in a route or component.

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
  admin: {
    home: '/admin',
    tenants: '/admin/tenants',
    tenantNew: '/admin/tenants/new',
    tenant: (id: string) => `/admin/tenants/${segment(id)}`,
    plans: '/admin/plans',
    transactions: '/admin/transactions',
    settlements: '/admin/settlements',
    reviews: '/admin/reviews',
    disputes: '/admin/disputes',
  },
  tenant: {
    home: tenantPath(),
    listings: tenantPath('/listings'),
    listingGroups: tenantPath('/listing-groups'),
    listingTypes: tenantPath('/listing-types'),
    partners: tenantPath('/partners'),
    partner: (partnerId: string) => tenantPath(`/partners/${segment(partnerId)}`),
    bookings: tenantPath('/bookings'),
    booking: (bookingId: string) => tenantPath(`/bookings/${segment(bookingId)}`),
    finance: tenantPath('/finance'),
    ledger: tenantPath('/finance/ledger'),
    settlements: tenantPath('/finance/settlements'),
    disputes: tenantPath('/finance/disputes'),
    reviews: tenantPath('/reviews'),
    transactions: tenantPath('/finance/transactions'),
    promotions: tenantPath('/promotions'),
    promotion: (promotionId: string) => tenantPath(`/promotions/${segment(promotionId)}`),
    affiliates: tenantPath('/affiliates'),
    affiliate: (affiliateId: string) => tenantPath(`/affiliates/${segment(affiliateId)}`),
    settings: tenantPath('/settings'),
  },
  partner: {
    home: partnerPath(),
    calendar: partnerPath('/calendar'),
    bookings: partnerPath('/bookings'),
    booking: (bookingId: string) => partnerPath(`/bookings/${segment(bookingId)}`),
    listings: partnerPath('/listings'),
    listing: (listingId: string) => partnerPath(`/listings/${segment(listingId)}`),
    listingGroup: (groupId: string) => partnerPath(`/listing-groups/${segment(groupId)}`),
    cancellationPolicies: partnerPath('/cancellation-policies'),
    newCancellationPolicy: partnerPath('/cancellation-policies/new'),
    cancellationPolicy: (policyId: string) =>
      partnerPath(`/cancellation-policies/${segment(policyId)}/edit`),
    promotions: partnerPath('/promotions'),
    promotion: (promotionId: string) => partnerPath(`/promotions/${segment(promotionId)}`),
    revenue: partnerPath('/revenue'),
    reviews: partnerPath('/reviews'),
    disputes: partnerPath('/disputes'),
    profile: partnerPath('/profile'),
  },
  affiliate: {
    home: '/affiliate',
    links: '/affiliate/links',
    commissions: '/affiliate/commissions',
  },
} as const;
