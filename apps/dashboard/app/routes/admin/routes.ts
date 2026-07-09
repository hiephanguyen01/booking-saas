import { index, route, type RouteConfigEntry } from '@react-router/dev/routes';

// Child routes of the platform-admin area (Task 1.12). This file is OWNED by the
// admin-area agent — add screens here and nothing else touches it. The parent
// `_layout.tsx` (requireScope('platform')) is wired in app/routes.ts.
export const adminChildren: RouteConfigEntry[] = [
  index('routes/admin/_index.tsx'),
  route('tenants', 'routes/admin/tenants/_index.tsx'),
  route('tenants/new', 'routes/admin/tenants/new.tsx'),
  route('tenants/:id', 'routes/admin/tenants/$id.tsx'),
  route('plans', 'routes/admin/plans/_index.tsx'),
];
