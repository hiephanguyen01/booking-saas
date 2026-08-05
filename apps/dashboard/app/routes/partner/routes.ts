import { index, route, type RouteConfigEntry } from '@react-router/dev/routes';

// Child routes of the partner area (Task 1.14). OWNED by the partner-area agent -
// add screens here and nothing else touches it. Parent `_layout.tsx`
// (requireScope('partner')) is wired in app/routes.ts.
export const partnerChildren: RouteConfigEntry[] = [
  index('routes/partner/_index.tsx'),
  route('legal-update', 'routes/partner/legal-update.tsx'),
  route('calendar', 'routes/partner/calendar.tsx'),
  route('geocode', 'routes/partner/geocode.tsx'),
  route('bookings', 'routes/partner/bookings/_index.tsx'),
  route('bookings/:bookingId', 'routes/partner/bookings/detail.tsx'),
  route('listings', 'routes/partner/listings/_index.tsx'),
  route('listings/:listingId/hours', 'routes/partner/listings/hours.tsx'),
  route('listings/new', 'routes/partner/listings/new.tsx'),
  route('listings/:listingId/edit', 'routes/partner/listings/edit.tsx'),
  route('listings/:listingId', 'routes/partner/listings/detail.tsx'),
  route('cancellation-policies', 'routes/partner/cancellation-policies/_index.tsx'),
  route('cancellation-policies/new', 'routes/partner/cancellation-policies/new.tsx'),
  route('cancellation-policies/:policyId/edit', 'routes/partner/cancellation-policies/edit.tsx'),
  route('listing-groups/new', 'routes/partner/listing-groups/new.tsx'),
  route('listing-groups/:groupId', 'routes/partner/listing-groups/detail.tsx'),
  route('listing-groups/:groupId/edit', 'routes/partner/listing-groups/edit.tsx'),
  route('listing-groups/:groupId/listings/new', 'routes/partner/listing-groups/listings.new.tsx'),
  route(
    'listing-groups/:groupId/listings/:listingId/edit',
    'routes/partner/listing-groups/listings.edit.tsx',
  ),
  route('revenue', 'routes/partner/revenue.tsx'),
  route('reviews', 'routes/partner/reviews.tsx'),
  route('favorites', 'routes/partner/favorites.tsx'),
  route('disputes', 'routes/partner/disputes.tsx'),
  route('promotions', 'routes/partner/promotions/_index.tsx'),
  route('promotions/new', 'routes/partner/promotions/new.tsx'),
  route('promotions/:promotionId', 'routes/partner/promotions/detail.tsx'),
  route('profile', 'routes/partner/profile.tsx'),
];
