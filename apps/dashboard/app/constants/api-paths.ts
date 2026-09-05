// The single source of BACKEND endpoint paths for the dashboard, mirroring
// `paths.ts` (which owns the dashboard's own route URLs). Loaders and actions
// consume this — never hand-build an endpoint string, and never append a query
// string by hand: pass `{ query }` to the api helper so encoding stays in one
// place.

function segment(value: string): string {
  return encodeURIComponent(value);
}

function tenantPath(suffix = ''): string {
  return `/tenant${suffix}`;
}

function partnerPath(suffix = ''): string {
  return `/partner${suffix}`;
}

export const apiPaths = {
  auth: {
    session: '/auth/session',
    /** The recipient's read-only preview of a mailed invitation (`@AuthenticatedOnly`, not tenant-scoped). */
    invitation: (token: string) => `/auth/invitations/${segment(token)}`,
    /** Accept it — 204 on success. */
    invitationAccept: (token: string) => `/auth/invitations/${segment(token)}/accept`,
  },
  me: {
    legalPending: '/me/legal/pending',
    legalAccept: '/me/legal/accept',
  },
  uploads: { presign: '/uploads/presign' },

  /** The caller own in-app inbox (`@AuthenticatedOnly`, tenant scope from the header). */
  notifications: {
    list: '/notifications',
    unreadCount: '/notifications/unread-count',
    read: (id: string) => `/notifications/${segment(id)}/read`,
    readAll: '/notifications/read-all',
  },

  /** Public reference data — no tenant scope, no auth. */
  publicData: {
    provinces: '/public/administrative-divisions/provinces',
  },

  public: {
    /** The dashboard BFF resolving its Host to a tenant (`@Public()`, pre-session). */
    adminTenant: '/public/admin-tenant',
    /**
     * The storefront's tenant-by-host resolution (`@Public()`), reused here to
     * turn an affiliate's `tenantHostname` (storefront host) into its
     * `adminHostname` (console host) via `x-forwarded-host` — see
     * `routes/workspaces.tsx`. `AffiliateResponse` carries no console hostname
     * of its own; this is the same lookup the storefront's own partner/affiliate
     * CTA already relies on (`apps/storefront/app/lib/server/tenant.server.ts`).
     */
    tenant: '/public/tenant',
  },

  admin: {
    plans: '/admin/plans',
    plan: (planId: string) => `/admin/plans/${segment(planId)}`,
    tenants: '/admin/tenants',
    tenant: (tenantId: string) => `/admin/tenants/${segment(tenantId)}`,
    /** Platform DNS facts: base domain + the CNAME/A targets a custom domain points at. */
    tenancyConfig: '/admin/tenants/config',
    tenantDomains: (tenantId: string) => `/admin/tenants/${segment(tenantId)}/domains`,
    tenantDomain: (tenantId: string, domainId: string) =>
      `/admin/tenants/${segment(tenantId)}/domains/${segment(domainId)}`,
    tenantDomainVerify: (tenantId: string, domainId: string) =>
      `/admin/tenants/${segment(tenantId)}/domains/${segment(domainId)}/verify`,
    tenantDomainDnsCheck: (tenantId: string, domainId: string) =>
      `/admin/tenants/${segment(tenantId)}/domains/${segment(domainId)}/dns-check`,
    /** PATCH the tenant's current subscription. */
    tenantSubscription: (tenantId: string) => `/admin/tenants/${segment(tenantId)}/subscription`,
    /** POST a new subscription for the tenant. */
    tenantSubscriptions: (tenantId: string) => `/admin/tenants/${segment(tenantId)}/subscriptions`,
  },

  platform: {
    health: '/platform/health',
    financeSettlements: '/platform/finance/settlements',
    payments: '/platform/payments',
    manualRefundBreakGlass: (tenantId: string, operationId: string) =>
      `/platform/tenants/${segment(tenantId)}/refunds/${segment(operationId)}/break-glass`,
    reviews: '/platform/reviews',
    financeDisputes: '/platform/finance/disputes',
    /** A tenant's commission rules, read by the platform admin. */
    tenantCommissionRules: (tenantId: string) =>
      `/platform/finance/tenants/${segment(tenantId)}/commission-rules`,
    /** PATCH a tenant's platform fee % (platform.finance.manage). */
    tenantPlatformRate: (tenantId: string) =>
      `/platform/finance/tenants/${segment(tenantId)}/platform-rate`,
  },

  tenant: {
    affiliates: tenantPath('/affiliates'),
    affiliateStatus: (affiliateId: string) =>
      tenantPath(`/affiliates/${segment(affiliateId)}/status`),

    bookings: tenantPath('/bookings'),
    bookingHistory: (bookingId: string) => tenantPath(`/bookings/${segment(bookingId)}/history`),
    bookingPartnerStats: tenantPath('/bookings/partner-stats'),

    cancellationPolicies: tenantPath('/cancellation-policies'),
    cancellationPolicy: (policyId: string) =>
      tenantPath(`/cancellation-policies/${segment(policyId)}`),

    contentReports: tenantPath('/content-reports'),
    contentReport: (reportId: string) => tenantPath(`/content-reports/${segment(reportId)}`),

    domains: tenantPath('/domains'),
    domain: (domainId: string) => tenantPath(`/domains/${segment(domainId)}`),
    domainPrimary: (domainId: string) => tenantPath(`/domains/${segment(domainId)}/primary`),
    domainVerify: (domainId: string) => tenantPath(`/domains/${segment(domainId)}/verify`),
    /** Live "is it pointed at us yet" lookup — on demand, never from a loader. */
    domainDnsCheck: (domainId: string) => tenantPath(`/domains/${segment(domainId)}/dns-check`),
    /** Where a custom domain must point. Same use case as the admin route, tenant-scoped. */
    tenancyConfig: tenantPath('/tenancy-config'),

    favorites: tenantPath('/favorites'),
    favoritesSummary: tenantPath('/favorites/summary'),

    commissionRules: tenantPath('/finance/commission-rules'),
    commissionRule: (ruleId: string) => tenantPath(`/finance/commission-rules/${segment(ruleId)}`),
    ledger: tenantPath('/finance/ledger'),
    payoutPolicy: tenantPath('/finance/payout-policy'),
    payouts: tenantPath('/finance/payouts'),
    payoutFail: (payoutId: string) => tenantPath(`/finance/payouts/${segment(payoutId)}/fail`),
    payoutMarkPaid: (payoutId: string) =>
      tenantPath(`/finance/payouts/${segment(payoutId)}/mark-paid`),
    settlementSummary: tenantPath('/finance/settlement-summary'),
    settlements: tenantPath('/finance/settlements'),
    settlement: (bookingId: string) => tenantPath(`/finance/settlements/${segment(bookingId)}`),
    financeDisputes: tenantPath('/finance/disputes'),
    financeSummary: tenantPath('/finance/summary'),
    taxFilings: tenantPath('/finance/tax/filings'),
    taxFilingPrepare: tenantPath('/finance/tax/filings/prepare'),
    taxFilingSubmit: (filingId: string) =>
      tenantPath(`/finance/tax/filings/${segment(filingId)}/submit`),
    taxFilingRemittances: (filingId: string) =>
      tenantPath(`/finance/tax/filings/${segment(filingId)}/remittances`),
    taxDocumentUpload: tenantPath('/finance/tax/documents/presign'),
    taxCertificates: tenantPath('/finance/tax/certificates'),
    taxCertificateDownload: (certificateId: string) =>
      tenantPath(`/finance/tax/certificates/${segment(certificateId)}/download`),
    taxCertificateVoid: (certificateId: string) =>
      tenantPath(`/finance/tax/certificates/${segment(certificateId)}/void`),

    /**
     * Tenant feature flags. `TenantSettingsController` is `@Controller('tenant')`
     * with `@Get('flags')` — NOT `/tenant/settings/flags`, which 404s. That
     * mistake once made the marketplace toggle inert in both directions.
     */
    flags: tenantPath('/flags'),
    defaultCancellationPolicy: tenantPath('/settings/default-cancellation-policy'),

    gatewayConfig: tenantPath('/gateway-config'),
    payosConfirmWebhook: tenantPath('/gateway-config/payos/confirm-webhook'),
    paymentRouting: tenantPath('/payment-routing'),
    refundPolicy: tenantPath('/refund-policy'),

    legal: tenantPath('/legal'),
    legalDraft: (docType: string) => tenantPath(`/legal/${segment(docType)}/draft`),
    legalPublish: (docType: string) => tenantPath(`/legal/${segment(docType)}/publish`),

    listingGroups: tenantPath('/listing-groups'),
    listingGroup: (groupId: string) => tenantPath(`/listing-groups/${segment(groupId)}`),
    listingGroupDetail: (groupId: string) =>
      tenantPath(`/listing-groups/${segment(groupId)}/detail`),
    listingGroupReview: (groupId: string) =>
      tenantPath(`/listing-groups/${segment(groupId)}/review`),

    listingRevisions: tenantPath('/listing-revisions'),

    listingTypes: tenantPath('/listing-types'),
    listingType: (listingTypeId: string) => tenantPath(`/listing-types/${segment(listingTypeId)}`),

    listings: tenantPath('/listings'),
    listing: (listingId: string) => tenantPath(`/listings/${segment(listingId)}`),
    listingReview: (listingId: string) => tenantPath(`/listings/${segment(listingId)}/review`),
    listingRevision: (listingId: string) => tenantPath(`/listings/${segment(listingId)}/revision`),

    members: tenantPath('/members'),
    member: (userId: string) => tenantPath(`/members/${segment(userId)}`),
    memberRoles: (userId: string) => tenantPath(`/members/${segment(userId)}/roles`),
    invitations: tenantPath('/members/invitations'),
    invitation: (invitationId: string) => tenantPath(`/members/invitations/${segment(invitationId)}`),

    partners: tenantPath('/partners'),
    partner: (partnerId: string) => tenantPath(`/partners/${segment(partnerId)}`),
    partnerDocuments: (partnerId: string) => tenantPath(`/partners/${segment(partnerId)}/documents`),
    partnerApprove: (partnerId: string) => tenantPath(`/partners/${segment(partnerId)}/approve`),
    /** POST a partner's tax status — decides their VAT regime (§VAT). */
    partnerTaxStatus: (partnerId: string) =>
      tenantPath(`/partners/${segment(partnerId)}/tax-status`),
    partnerTaxAssessment: (partnerId: string) =>
      tenantPath(`/partners/${segment(partnerId)}/tax-assessment`),
    partnerTaxDeclarations: (partnerId: string) =>
      tenantPath(`/partners/${segment(partnerId)}/tax-declarations`),
    housePartners: tenantPath('/partners/house'),

    payments: tenantPath('/payments'),
    paymentRefunds: tenantPath('/payments/refunds'),
    paymentRefundConfirm: (refundId: string) =>
      tenantPath(`/payments/refunds/${segment(refundId)}/confirm`),
    manualRefunds: tenantPath('/refunds'),
    manualRefund: (operationId: string) => tenantPath(`/refunds/${segment(operationId)}`),
    manualRefundAction: (operationId: string, action: string) =>
      tenantPath(`/refunds/${segment(operationId)}/${segment(action)}`),

    promotions: tenantPath('/promotions'),
    promotion: (promotionId: string) => tenantPath(`/promotions/${segment(promotionId)}`),
    promotionEnd: (promotionId: string) => tenantPath(`/promotions/${segment(promotionId)}/end`),
    promotionUsageStats: (promotionId: string) =>
      tenantPath(`/promotions/${segment(promotionId)}/usage-stats`),
    promotionCategories: tenantPath('/promotions/categories'),

    reviews: tenantPath('/reviews'),
    roles: tenantPath('/roles'),
    rolesAssignable: tenantPath('/roles/assignable'),
    role: (roleId: string) => tenantPath(`/roles/${segment(roleId)}`),
    subscriptionStatus: tenantPath('/subscription/status'),
    theme: tenantPath('/theme'),
  },

  partner: {
    geocode: partnerPath('/administrative-divisions/geocode'),
    bookings: partnerPath('/bookings'),
    booking: (bookingId: string) => partnerPath(`/bookings/${segment(bookingId)}`),
    bookingHistory: (bookingId: string) => partnerPath(`/bookings/${segment(bookingId)}/history`),
    /** `approve` · `complete` · `no-show` · `note` · `pick-up` · `reject`. */
    bookingAction: (bookingId: string, action: string) =>
      partnerPath(`/bookings/${segment(bookingId)}/${segment(action)}`),

    cancellationPolicies: partnerPath('/cancellation-policies'),
    cancellationPolicy: (policyId: string) =>
      partnerPath(`/cancellation-policies/${segment(policyId)}`),

    favorites: partnerPath('/favorites'),
    favoritesSummary: partnerPath('/favorites/summary'),

    finance: partnerPath('/finance'),
    taxCertificates: partnerPath('/finance/tax/certificates'),
    taxCertificateDownload: (certificateId: string) =>
      partnerPath(`/finance/tax/certificates/${segment(certificateId)}/download`),
    financeDisputes: partnerPath('/finance/disputes'),
    ledger: partnerPath('/finance/ledger'),
    payouts: partnerPath('/finance/payouts'),
    settlementSummary: partnerPath('/finance/settlement-summary'),
    settlement: (bookingId: string) => partnerPath(`/finance/settlements/${segment(bookingId)}`),

    listingGroups: partnerPath('/listing-groups'),
    listingGroup: (groupId: string) => partnerPath(`/listing-groups/${segment(groupId)}`),
    listingGroupSubmit: (groupId: string) =>
      partnerPath(`/listing-groups/${segment(groupId)}/submit`),
    listingGroupRevision: (groupId: string) =>
      partnerPath(`/listing-groups/${segment(groupId)}/revision`),

    listingRevisions: partnerPath('/listing-revisions'),
    listingTypes: partnerPath('/listing-types'),

    listings: partnerPath('/listings'),
    listing: (listingId: string) => partnerPath(`/listings/${segment(listingId)}`),
    listingPricingRules: (listingId: string) =>
      partnerPath(`/listings/${segment(listingId)}/pricing-rules`),
    listingRevision: (listingId: string) => partnerPath(`/listings/${segment(listingId)}/revision`),
    listingDepositRequirement: partnerPath('/listings/deposit-requirement'),
    listingFeed: partnerPath('/listings/feed'),

    members: partnerPath('/members'),
    member: (userId: string) => partnerPath(`/members/${segment(userId)}`),
    memberRoles: (userId: string) => partnerPath(`/members/${segment(userId)}/roles`),
    invitations: partnerPath('/members/invitations'),
    invitation: (invitationId: string) => partnerPath(`/members/invitations/${segment(invitationId)}`),
    rolesAssignable: partnerPath('/roles/assignable'),

    profile: partnerPath('/profile'),
    profileAgreements: partnerPath('/profile/agreements'),
    profileDefaultCancellationPolicy: partnerPath('/profile/default-cancellation-policy'),
    profileDocuments: partnerPath('/profile/documents'),
    profileDocumentPresign: partnerPath('/profile/documents/presign'),
    profileDocumentList: partnerPath('/profile/documents'),
    profileIdentity: partnerPath('/profile/identity'),
    profilePayout: partnerPath('/profile/payout'),
    profileTaxAssessment: partnerPath('/profile/tax-assessment'),
    profileTaxDeclarations: partnerPath('/profile/tax-declarations'),

    promotions: partnerPath('/promotions'),
    promotion: (promotionId: string) => partnerPath(`/promotions/${segment(promotionId)}`),
    promotionEnd: (promotionId: string) => partnerPath(`/promotions/${segment(promotionId)}/end`),
    /** Accept sponsoring a tenant-created, partner-funded promotion. */
    promotionOptIn: (promotionId: string) =>
      partnerPath(`/promotions/${segment(promotionId)}/opt-in`),
    promotionsPendingOptin: partnerPath('/promotions/pending-optin'),

    reviews: partnerPath('/reviews'),
  },

  affiliate: {
    commissions: '/affiliate/commissions',
    links: '/affiliate/links',
    link: (linkId: string) => `/affiliate/links/${segment(linkId)}`,
    me: '/affiliate/me',
    payoutInfo: '/affiliate/payout-info',
    stats: '/affiliate/stats',
  },
} as const;

/**
 * `pageSize` for the "load every row" reads that feed pickers and dashboard
 * roll-ups — screens that need the whole set, not a page of it. It was spelled
 * three different ways across ten call sites before this.
 */
export const FETCH_ALL_PAGE_SIZE = 100;
