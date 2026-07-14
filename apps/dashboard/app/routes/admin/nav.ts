import { Building2, LayoutDashboard, Package } from 'lucide-react';
import type { DashboardNavSection } from '~/lib/navigation-types';

// Sidebar nav for the platform-admin area (Task 1.12), grouped into labelled
// sections. OWNED by the admin agent — add a screen to the right section. Keep
// the overview cluster (no label) first.
export const adminNavSections: DashboardNavSection[] = [
  { items: [{ title: 'Tổng quan', to: '/admin', icon: LayoutDashboard }] },
  {
    label: 'Quản lý',
    items: [
      { title: 'Tenant', to: '/admin/tenants', icon: Building2, permission: 'platform.tenants.read' },
      { title: 'Gói dịch vụ', to: '/admin/plans', icon: Package, permission: 'platform.plans.manage' },
    ],
  },
];
