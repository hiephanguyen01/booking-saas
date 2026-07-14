import { index, route, type RouteConfig } from '@react-router/dev/routes';
import { adminChildren } from './routes/admin/routes';
import { tenantChildren } from './routes/tenant/routes';
import { partnerChildren } from './routes/partner/routes';
import { affiliateChildren } from './routes/affiliate/routes';

// The dashboard shell (sidebar + header) lives in root.tsx and gates areas by the
// user's scopes. Each area is a permission-guarded nested layout: its `_layout.tsx`
// loader calls `requireScope(...)`, and children render inside it.
//
// Wave-3 convention — each area's child routes live in its OWN file
// (routes/<area>/routes.ts) and its nav items in routes/<area>/nav.ts, so the
// three area agents never edit a shared file. To add a screen, edit that area's
// routes.ts + nav.ts only.
export default [
  index('routes/home.tsx'),

  route('auth/login', 'routes/auth/login.tsx'),
  route('auth/logout', 'routes/auth/logout.tsx'),

  // Presign proxy for direct-to-storage image uploads (§4.2) — any logged-in user.
  route('uploads/presign', 'routes/uploads.presign.tsx'),

  route('admin', 'routes/admin/_layout.tsx', adminChildren),
  route('tenant', 'routes/tenant/_layout.tsx', tenantChildren),
  route('partner', 'routes/partner/_layout.tsx', partnerChildren),

  // Affiliate self-service portal (§15.3) — membership-gated (not RBAC-scoped);
  // the layout resolves the user's approved `affiliates` row(s).
  route('affiliate', 'routes/affiliate/_layout.tsx', affiliateChildren),
] satisfies RouteConfig;
