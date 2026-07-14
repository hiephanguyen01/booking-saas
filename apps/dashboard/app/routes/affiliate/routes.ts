import { index, route, type RouteConfigEntry } from '@react-router/dev/routes';

// Child routes of the affiliate self-service portal (§15.3). Membership-gated by
// the parent `_layout.tsx` (requireAffiliate) — wired in app/routes.ts.
export const affiliateChildren: RouteConfigEntry[] = [
  index('routes/affiliate/_index.tsx'),
  route('links', 'routes/affiliate/links.tsx'),
  route('commissions', 'routes/affiliate/commissions.tsx'),
];
