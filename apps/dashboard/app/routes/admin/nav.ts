import { Building2, LayoutDashboard, Package } from 'lucide-react';
import type { DashboardNavItem } from '~/lib/navigation-types';

// Sidebar nav for the platform-admin area (Task 1.12). OWNED by the admin agent —
// append one entry per list screen. Keep the overview item first.
export const adminNavItems: DashboardNavItem[] = [
  { title: 'Tổng quan', to: '/admin', icon: LayoutDashboard },
  { title: 'Tenant', to: '/admin/tenants', icon: Building2, permission: 'platform.tenants.read' },
  { title: 'Gói dịch vụ', to: '/admin/plans', icon: Package, permission: 'platform.plans.manage' },
];
