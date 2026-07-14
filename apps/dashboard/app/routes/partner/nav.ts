import { CalendarCheck, CalendarDays, ContactRound, LayoutDashboard, Store, Wallet } from 'lucide-react';
import type { DashboardNavItem } from '~/lib/navigation-types';
import { dashboardPaths } from '~/lib/paths';

// Sidebar nav for the partner area (Task 1.14). OWNED by the partner agent -
// append one entry per list screen. Keep the overview item first.
export function partnerNavItems(partnerId: string): DashboardNavItem[] {
  return [
    { title: 'Tổng quan', to: dashboardPaths.partner.home(partnerId), icon: LayoutDashboard },
    { title: 'Lịch tổng', to: dashboardPaths.partner.calendar(partnerId), icon: CalendarDays, permission: 'partner.bookings.read' },
    { title: 'Lượt đặt', to: dashboardPaths.partner.bookings(partnerId), icon: CalendarCheck, permission: 'partner.bookings.read' },
    { title: 'Tin đăng', to: dashboardPaths.partner.listings(partnerId), icon: Store, permission: 'partner.listings.read' },
    { title: 'Doanh thu', to: dashboardPaths.partner.revenue(partnerId), icon: Wallet, permission: 'partner.finance.read' },
    { title: 'Hồ sơ', to: dashboardPaths.partner.profile(partnerId), icon: ContactRound, permission: 'partner.profile.manage' },
  ];
}
