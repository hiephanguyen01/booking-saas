import { index, route, type RouteConfigEntry } from '@react-router/dev/routes';

// Child routes of the tenant area (Task 1.13). OWNED by the tenant-area agent —
// add screens here and nothing else touches it. Parent `_layout.tsx`
// (requireScope('tenant')) is wired in app/routes.ts.
export const tenantChildren: RouteConfigEntry[] = [
  index('routes/tenant/_index.tsx'),
  route('listings', 'routes/tenant/listings/_index.tsx'),
  route('listings/:listingId/review', 'routes/tenant/listings/review.tsx'),
  route('bookings', 'routes/tenant/bookings/_index.tsx'),
  route('finance', 'routes/tenant/finance/_index.tsx'),
  route('promotions', 'routes/tenant/promotions/_index.tsx'),
  route('promotions/new', 'routes/tenant/promotions/new.tsx'),
  route('promotions/:promotionId', 'routes/tenant/promotions/detail.tsx'),
  route('settings', 'routes/tenant/settings/_index.tsx'),
];
