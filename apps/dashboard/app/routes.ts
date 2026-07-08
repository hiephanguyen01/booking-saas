import { index, route, type RouteConfig } from '@react-router/dev/routes';

// 4 areas, one per role (TONG-QUAN.md §5). Each grows its own nested routes
// in Phase 1; route-level permission guards arrive with the BFF auth work.
export default [
  index('routes/home.tsx'),
  route('admin', 'routes/admin/home.tsx'),
  route('tenant', 'routes/tenant/home.tsx'),
  route('partner', 'routes/partner/home.tsx'),
  route('affiliate', 'routes/affiliate/home.tsx'),
] satisfies RouteConfig;
