import { index, route, type RouteConfigEntry } from '@react-router/dev/routes';

// Child routes of the tenant area (Task 1.13). OWNED by the tenant-area agent —
// add screens here and nothing else touches it. Parent `_layout.tsx`
// (requireScope('tenant')) is wired in app/routes.ts.
export const tenantChildren: RouteConfigEntry[] = [
  index('routes/tenant/_index.tsx'),
  route('listings', 'routes/tenant/listings/_index.tsx'),
  route('listings/:listingId/review', 'routes/tenant/listings/review.tsx'),
  route('listing-groups', 'routes/tenant/listing-groups/_index.tsx'),
  route('listing-groups/:groupId/review', 'routes/tenant/listing-groups/review.tsx'),
  route('listing-types', 'routes/tenant/listing-types/_index.tsx'),
  route('listing-types/new', 'routes/tenant/listing-types/new.tsx'),
  route('listing-types/:listingTypeId/edit', 'routes/tenant/listing-types/edit.tsx'),
  route('partners', 'routes/tenant/partners/_index.tsx'),
  route('partners/new', 'routes/tenant/partners/new.tsx'),
  route('partners/:partnerId', 'routes/tenant/partners/detail.tsx'),
  route('bookings', 'routes/tenant/bookings/_index.tsx'),
  route('bookings/:bookingId', 'routes/tenant/bookings/detail.tsx'),
  route('reviews', 'routes/tenant/reviews.tsx'),
  route('favorites', 'routes/tenant/favorites.tsx'),
  route('content-reports', 'routes/tenant/content-reports/_index.tsx'),
  route('content-reports/:reportId', 'routes/tenant/content-reports/detail.tsx'),
  route('finance', 'routes/tenant/finance/_index.tsx'),
  route('finance/tax', 'routes/tenant/finance/tax.tsx'),
  route('finance/tax-documents/presign', 'routes/tenant/finance/tax-documents.presign.tsx'),
  route(
    'finance/tax-certificates/:certificateId/download',
    'routes/tenant/finance/tax-certificate.download.tsx',
  ),
  route('finance/ledger', 'routes/tenant/finance/ledger.tsx'),
  route('finance/settlements', 'routes/tenant/finance/settlements.tsx'),
  route('finance/disputes', 'routes/tenant/finance/disputes.tsx'),
  route('finance/transactions', 'routes/tenant/finance/transactions.tsx'),
  route('promotions', 'routes/tenant/promotions/_index.tsx'),
  route('promotions/new', 'routes/tenant/promotions/new.tsx'),
  route('promotions/:promotionId', 'routes/tenant/promotions/detail.tsx'),
  route('affiliates', 'routes/tenant/affiliates/_index.tsx'),
  route('affiliates/:affiliateId', 'routes/tenant/affiliates/detail.tsx'),
  route('settings', 'routes/tenant/settings.tsx'),
  route('members', 'routes/tenant/members/_index.tsx'),
  route('members/invite', 'routes/tenant/members/invite.tsx'),
  route('members/:userId', 'routes/tenant/members/detail.tsx'),
];
