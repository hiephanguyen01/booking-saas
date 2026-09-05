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
  partnerDocumentUploadPresign: '/uploads/partner-documents/presign',
  /** The recipient may hold no membership yet, so this sits outside every area group. */
  invitationAccept: (token: string) => `/invitations/${segment(token)}`,
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
    notifications: tenantPath('/notifications'),
    listings: tenantPath('/listings'),
    /** Moderation screen for one listing awaiting review. */
    listingReview: (listingId: string) => tenantPath(`/listings/${segment(listingId)}/review`),
    listingGroups: tenantPath('/listing-groups'),
    listingGroupReview: (groupId: string) =>
      tenantPath(`/listing-groups/${segment(groupId)}/review`),
    listingTypes: tenantPath('/listing-types'),
    listingTypeNew: tenantPath('/listing-types/new'),
    partners: tenantPath('/partners'),
    partnerNew: tenantPath('/partners/new'),
    partner: (partnerId: string) => tenantPath(`/partners/${segment(partnerId)}`),
    bookings: tenantPath('/bookings'),
    booking: (bookingId: string) => tenantPath(`/bookings/${segment(bookingId)}`),
    finance: tenantPath('/finance'),
    taxOperations: tenantPath('/finance/tax'),
    taxDocumentUpload: tenantPath('/finance/tax-documents/presign'),
    taxCertificateDownload: (certificateId: string) =>
      tenantPath(`/finance/tax-certificates/${segment(certificateId)}/download`),
    ledger: tenantPath('/finance/ledger'),
    settlements: tenantPath('/finance/settlements'),
    disputes: tenantPath('/finance/disputes'),
    reviews: tenantPath('/reviews'),
    favorites: tenantPath('/favorites'),
    contentReports: tenantPath('/content-reports'),
    contentReport: (reportId: string) => tenantPath(`/content-reports/${segment(reportId)}`),
    transactions: tenantPath('/finance/transactions'),
    manualRefundEvidencePresign: (operationId: string, version: number) =>
      `${tenantPath(`/finance/manual-refunds/${segment(operationId)}/evidence-presign`)}?version=${version}`,
    promotions: tenantPath('/promotions'),
    promotionNew: tenantPath('/promotions/new'),
    promotion: (promotionId: string) => tenantPath(`/promotions/${segment(promotionId)}`),
    affiliates: tenantPath('/affiliates'),
    affiliate: (affiliateId: string) => tenantPath(`/affiliates/${segment(affiliateId)}`),
    settings: tenantPath('/settings'),
    /** Deep-link into a settings tab, e.g. `dashboardPaths.tenant.settingsSection('legal')`. */
    settingsSection: (section: string) => `${tenantPath('/settings')}?section=${segment(section)}`,
    members: tenantPath('/members'),
    /** Deep-link into a members tab, e.g. `dashboardPaths.tenant.membersSection('invitations')`. */
    membersSection: (section: string) => `${tenantPath('/members')}?section=${segment(section)}`,
    memberInvite: tenantPath('/members/invite'),
    member: (userId: string) => tenantPath(`/members/${segment(userId)}`),
    roles: tenantPath('/roles'),
    roleNew: tenantPath('/roles/new'),
    /** "Nhân bản": create screen pre-filled from an existing (typically system) role's permissions. */
    roleNewFrom: (roleId: string) => `${tenantPath('/roles/new')}?from=${segment(roleId)}`,
    roleEdit: (roleId: string) => tenantPath(`/roles/${segment(roleId)}/edit`),
  },
  partner: {
    home: partnerPath(),
    notifications: partnerPath('/notifications'),
    geocode: partnerPath('/geocode'),
    calendar: partnerPath('/calendar'),
    bookings: partnerPath('/bookings'),
    booking: (bookingId: string) => partnerPath(`/bookings/${segment(bookingId)}`),
    listings: partnerPath('/listings'),
    listingNew: (listingTypeId?: string, mode?: 'standalone' | 'grouped') => {
      const base = partnerPath('/listings/new');
      if (!listingTypeId) return base;
      const params = new URLSearchParams({ type: listingTypeId });
      if (mode) params.set('mode', mode);
      return `${base}?${params.toString()}`;
    },
    listing: (listingId: string) => partnerPath(`/listings/${segment(listingId)}`),
    listingEdit: (listingId: string) => partnerPath(`/listings/${segment(listingId)}/edit`),
    listingHours: (listingId: string) => partnerPath(`/listings/${segment(listingId)}/hours`),
    listingGroup: (groupId: string) => partnerPath(`/listing-groups/${segment(groupId)}`),
    listingGroups: partnerPath('/listing-groups'),
    listingGroupEdit: (groupId: string) => partnerPath(`/listing-groups/${segment(groupId)}/edit`),
    listingGroupItemNew: (groupId: string) =>
      partnerPath(`/listing-groups/${segment(groupId)}/listings/new`),
    listingGroupItemEdit: (groupId: string, listingId: string) =>
      partnerPath(`/listing-groups/${segment(groupId)}/listings/${segment(listingId)}/edit`),
    newListingGroup: (listingTypeId: string) =>
      `${partnerPath('/listing-groups/new')}?type=${segment(listingTypeId)}`,
    cancellationPolicies: partnerPath('/cancellation-policies'),
    newCancellationPolicy: partnerPath('/cancellation-policies/new'),
    cancellationPolicy: (policyId: string) =>
      partnerPath(`/cancellation-policies/${segment(policyId)}/edit`),
    promotions: partnerPath('/promotions'),
    promotionNew: partnerPath('/promotions/new'),
    promotion: (promotionId: string) => partnerPath(`/promotions/${segment(promotionId)}`),
    revenue: partnerPath('/revenue'),
    taxCertificateDownload: (certificateId: string) =>
      partnerPath(`/tax-certificates/${segment(certificateId)}/download`),
    reviews: partnerPath('/reviews'),
    favorites: partnerPath('/favorites'),
    disputes: partnerPath('/disputes'),
    members: partnerPath('/members'),
    /** Deep-link into a members tab, e.g. `dashboardPaths.partner.membersSection('invitations')`. */
    membersSection: (section: string) => `${partnerPath('/members')}?section=${segment(section)}`,
    memberInvite: partnerPath('/members/invite'),
    member: (userId: string) => partnerPath(`/members/${segment(userId)}`),
    profile: partnerPath('/profile'),
    /** Re-acceptance interstitial (Task 16) — reached only via the layout's redirect. */
    legalUpdate: partnerPath('/legal-update'),
  },
  affiliate: {
    home: '/affiliate',
    links: '/affiliate/links',
    commissions: '/affiliate/commissions',
    /** Re-acceptance interstitial (Task 16) — reached only via the layout's redirect. */
    legalUpdate: '/affiliate/legal-update',
  },
} as const;
