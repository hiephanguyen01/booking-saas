import { Building2, ShieldCheck, Store } from 'lucide-react';
import type { DashboardArea } from './navigation-types';
import { adminNavItems } from '~/routes/admin/nav';
import { tenantNavItems } from '~/routes/tenant/nav';
import { partnerNavItems } from '~/routes/partner/nav';

// Re-export the nav types so existing consumers (app-sidebar.tsx, etc.) keep
// importing them from `~/lib/navigation`.
export type { DashboardArea, DashboardNavItem } from './navigation-types';

/**
 * The three dashboard areas and their sidebar nav. The shell renders an area
 * only when the user has a matching scope membership; within an area, an item
 * with `permission` is hidden unless the user holds it. Each area's `items` come
 * from its own `routes/<area>/nav.ts` — area agents edit only that file.
 */
export const DASHBOARD_AREAS: DashboardArea[] = [
  {
    scope: 'platform',
    title: 'Platform Admin',
    description: 'Quản trị nền tảng: tenant, gói dịch vụ, tài chính.',
    basePath: '/admin',
    icon: ShieldCheck,
    items: adminNavItems,
  },
  {
    scope: 'tenant',
    title: 'Tenant',
    description: 'Điều hành cửa hàng: listing, đặt chỗ, đối tác, khuyến mãi.',
    basePath: '/tenant',
    icon: Building2,
    items: tenantNavItems,
  },
  {
    scope: 'partner',
    title: 'Partner',
    description: 'Quản lý dịch vụ, lịch trống và đơn đặt của bạn.',
    basePath: '/partner',
    icon: Store,
    items: partnerNavItems,
  },
];
