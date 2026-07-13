import { index, route, type RouteConfigEntry } from '@react-router/dev/routes';

// Child routes of the partner area (Task 1.14). OWNED by the partner-area agent -
// add screens here and nothing else touches it. Parent `_layout.tsx`
// (requireScope('partner')) is wired in app/routes.ts.
export const partnerChildren: RouteConfigEntry[] = [
  index('routes/partner/_index.tsx'),
  route('calendar', 'routes/partner/calendar.tsx'),
  route('bookings', 'routes/partner/bookings.tsx'),
  route('listings', 'routes/partner/listings.tsx'),
  route('listings/:listingId/hours', 'routes/partner/listings.$listingId.hours.tsx'),
  route('listings/new', 'routes/partner/listings.new.tsx'),
  route('listings/:listingId/edit', 'routes/partner/listings.$listingId.edit.tsx'),
  route('revenue', 'routes/partner/revenue.tsx'),
];
