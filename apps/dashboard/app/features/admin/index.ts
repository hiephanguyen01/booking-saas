/**
 * admin feature — public API
 *
 * Co-locates all platform-admin domain logic.
 * Routes in `routes/admin/` import from here as the feature grows.
 *
 * Pattern: keep route files thin — move loaders, actions, and heavy components here.
 *
 *   routes/admin/tenants.tsx:
 *     export { loader } from '~/features/admin';
 *     export { default } from '~/features/admin/TenantsPage';
 *
 * Future structure:
 *   features/admin/
 *     api/          # admin-specific API calls
 *     components/   # AdminTable, TenantCard, etc.
 *     hooks/        # useAdminStats
 *     loader.ts
 *     action.ts
 *     index.ts
 */

// placeholder — add exports as admin logic is extracted from routes/admin/
export {};
