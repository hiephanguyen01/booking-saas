import { Building2, CreditCard, LayoutDashboard, Package, Scale } from 'lucide-react';
import type { DashboardNavSection } from '~/lib/navigation-types';
import { dashboardPaths } from '~/constants/paths';

// Sidebar nav for the platform-admin area (Task 1.12), grouped into labelled
// sections. OWNED by the admin agent — add a screen to the right section. Keep
// the overview cluster (no label) first.
export const adminNavSections: DashboardNavSection[] = [
  { items: [{ title: 'Tổng quan', to: dashboardPaths.admin.home, icon: LayoutDashboard }] },
  {
    label: 'Quản lý',
    items: [
      {
        title: 'Tenant',
        to: dashboardPaths.admin.tenants,
        icon: Building2,
        permission: 'platform.tenants.read',
      },
      {
        title: 'Gói dịch vụ',
        to: dashboardPaths.admin.plans,
        icon: Package,
        permission: 'platform.plans.manage',
      },
      {
        title: 'Giao dịch',
        to: dashboardPaths.admin.transactions,
        icon: CreditCard,
        permission: 'platform.finance.read',
      },
      {
        title: 'Đối soát giữ tiền',
        to: dashboardPaths.admin.settlements,
        icon: Scale,
        permission: 'platform.finance.read',
      },
    ],
  },
];
