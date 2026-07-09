import { index, route, type RouteConfigEntry } from '@react-router/dev/routes';

// Child routes of the partner area (Task 1.14). OWNED by the partner-area agent -
// add screens here and nothing else touches it. Parent `_layout.tsx`
// (requireScope('partner')) is wired in app/routes.ts.
export const partnerChildren: RouteConfigEntry[] = [
  index('routes/partner/_index.tsx'),
  route('calendar', 'routes/partner/calendar.tsx'),
  route('bookings', 'routes/partner/bookings.tsx'),
  route('listings', 'routes/partner/listings.tsx'),
  route('revenue', 'routes/partner/revenue.tsx'),
];
