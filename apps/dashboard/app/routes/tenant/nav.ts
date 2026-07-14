import {
  LayoutDashboard,
  Store,
  Files,
  Tags,
  Users,
  CalendarCheck,
  Wallet,
  BookText,
  Ticket,
  Share2,
  Settings,
} from 'lucide-react';
import type { DashboardNavItem } from '~/lib/navigation-types';
import { dashboardPaths } from '~/lib/paths';

// Sidebar nav for the tenant area (Task 1.13). OWNED by the tenant agent —
// append one entry per list screen. Keep the overview item first. Items with a
// `permission` are hidden by the shell unless the user holds it in tenant scope.
export function tenantNavItems(tenantId: string): DashboardNavItem[] {
  return [
    { title: 'Tổng quan', to: dashboardPaths.tenant.home(tenantId), icon: LayoutDashboard },
    { title: 'Listing', to: dashboardPaths.tenant.listings(tenantId), icon: Store, permission: 'tenant.listings.read' },
    { title: 'Bài đăng', to: dashboardPaths.tenant.listingGroups(tenantId), icon: Files, permission: 'tenant.listings.read' },
    { title: 'Loại dịch vụ', to: dashboardPaths.tenant.listingTypes(tenantId), icon: Tags, permission: 'tenant.listings.read' },
    { title: 'Đối tác', to: dashboardPaths.tenant.partners(tenantId), icon: Users, permission: 'tenant.partners.read' },
    { title: 'Đặt chỗ', to: dashboardPaths.tenant.bookings(tenantId), icon: CalendarCheck, permission: 'tenant.bookings.read' },
    { title: 'Tài chính', to: dashboardPaths.tenant.finance(tenantId), icon: Wallet, permission: 'tenant.finance.read' },
    { title: 'Sổ cái', to: dashboardPaths.tenant.ledger(tenantId), icon: BookText, permission: 'tenant.finance.read' },
    { title: 'Khuyến mãi', to: dashboardPaths.tenant.promotions(tenantId), icon: Ticket, permission: 'tenant.promotions.manage' },
    { title: 'Cộng tác viên', to: dashboardPaths.tenant.affiliates(tenantId), icon: Share2, permission: 'tenant.affiliates.manage' },
    { title: 'Cài đặt', to: dashboardPaths.tenant.settings(tenantId), icon: Settings, permission: 'tenant.theme.manage' },
  ];
}
