// The single source of BACKEND endpoint paths for the storefront, mirroring
// `paths.ts` (which owns the storefront's own route URLs). Only `*.server.ts`
// modules consume this — never hand-build an endpoint string, and never append a
// query string by hand: pass the api helper's query option so encoding stays in
// one place.
//
// Path params are encoded here, so call sites pass the raw value: a second
// `encodeURIComponent` at the call site would double-encode it.

function segment(value: string): string {
  return encodeURIComponent(value);
}

function publicPath(suffix = ''): string {
  return `/public${suffix}`;
}

export const apiPaths = {
  auth: {
    login: '/auth/login',
    session: '/auth/session',
    /** The signed-in user's own profile: `PATCH` edits name/phone/photo. */
    me: '/auth/me',
    mePassword: '/auth/me/password',
    registrationStart: '/auth/registration/start',
    registrationResend: '/auth/registration/resend',
    registrationVerify: '/auth/registration/verify',
    registrationComplete: '/auth/registration/complete',
    /**
     * Registration and password reset expose the same four-step shape under
     * different prefixes, so the flow config supplies the endpoint segment.
     */
    flowStart: (flow: string) => `/auth/${segment(flow)}/start`,
    flowResend: (flow: string) => `/auth/${segment(flow)}/resend`,
    flowVerify: (flow: string) => `/auth/${segment(flow)}/verify`,
    flowComplete: (flow: string) => `/auth/${segment(flow)}/complete`,
  },

  account: {
    favorites: '/account/favorites',
    terms: '/account/terms',
    legalAcceptances: '/me/legal/acceptances',
  },

  /** Signed-in customer endpoints (`/customer/*`), distinct from the public reads. */
  customer: {
    favorites: '/customer/favorites',
    favoriteRefs: '/customer/favorites/refs',
    reviews: '/customer/reviews',
    reviewMediaPresign: '/customer/reviews/media/presign',
    contentReports: '/customer/content-reports',
    financeDisputes: '/customer/finance/disputes',
    financeDisputeStates: '/customer/finance/dispute-states',
  },

  partner: {
    apply: '/partners/apply',
    applicationDocumentPresign: '/partners/application-documents/presign',
  },

  /** The generic authenticated upload grant; the target picks the storage album. */
  uploads: {
    presign: '/uploads/presign',
  },

  affiliate: {
    apply: '/affiliate/apply',
    trackReferral: publicPath('/referrals/track'),
  },

  public: {
    tenant: publicPath('/tenant'),
    provinces: publicPath('/administrative-divisions/provinces'),
    wards: publicPath('/administrative-divisions/wards'),

    listings: publicPath('/listings'),
    nearbyListings: publicPath('/listings/nearby'),
    listing: (slug: string) => publicPath(`/listings/${segment(slug)}`),
    listingAvailability: (slug: string) => publicPath(`/listings/${segment(slug)}/availability`),
    listingQuote: (slug: string) => publicPath(`/listings/${segment(slug)}/quote`),
    listingGroup: (slug: string) => publicPath(`/listings/groups/${segment(slug)}`),
    listingTypes: publicPath('/listing-types'),

    partner: (partnerSlug: string) => publicPath(`/partners/${segment(partnerSlug)}`),
    reviews: publicPath('/reviews'),

    bookings: publicPath('/bookings'),
    booking: (code: string) => publicPath(`/bookings/${segment(code)}`),
    bookingCancel: (code: string) => publicPath(`/bookings/${segment(code)}/cancel`),
    bookingCheckout: (bookingId: string) => publicPath(`/bookings/${segment(bookingId)}/checkout`),
    bookingMockPay: (code: string) => publicPath(`/bookings/${segment(code)}/mock-pay`),
    bookingPaymentStatus: (code: string) => publicPath(`/bookings/${segment(code)}/payment-status`),
    bookingRequestOtp: (code: string) => publicPath(`/bookings/${segment(code)}/request-otp`),
    bookingVerifyAccess: (code: string) => publicPath(`/bookings/${segment(code)}/verify-access`),
    bookingManualRefunds: (code: string) => publicPath(`/bookings/${segment(code)}/manual-refunds`),
    bookingManualRefundDestination: (code: string, operationId: string) =>
      publicPath(`/bookings/${segment(code)}/manual-refunds/${segment(operationId)}/destination`),
    bookingManualRefundAcknowledgement: (code: string, operationId: string) =>
      publicPath(
        `/bookings/${segment(code)}/manual-refunds/${segment(operationId)}/acknowledgement`,
      ),
    myBookings: publicPath('/my-bookings'),

    checkoutPromotions: publicPath('/checkout/promotions'),
    checkoutValidatePromo: publicPath('/checkout/validate-promo'),
    paymentOptions: publicPath('/payment-options'),

    legal: publicPath('/legal'),
    legalDocument: (docType: string) => publicPath(`/legal/${segment(docType)}`),
    legalDocumentVersion: (docType: string, versionNo: string | number) =>
      publicPath(`/legal/${segment(docType)}/versions/${segment(String(versionNo))}`),
  },
} as const;

/**
 * `pageSize` for the "load every row" reads that back a picker or a summary —
 * screens that need the whole set, not a page of it. Mirrors the dashboard's
 * constant of the same name so the two frontends agree on what "all" means.
 */
export const FETCH_ALL_PAGE_SIZE = 100;
