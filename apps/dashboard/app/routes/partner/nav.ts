import { CalendarCheck, CalendarDays, ContactRound, LayoutDashboard, Store, Ticket, Wallet } from 'lucide-react';
import type { DashboardNavItem } from '~/lib/navigation-types';

// Sidebar nav for the partner area (Task 1.14). OWNED by the partner agent -
// append one entry per list screen. Keep the overview item first.
export const partnerNavItems: DashboardNavItem[] = [
  { title: 'Tổng quan', to: '/partner', icon: LayoutDashboard },
  { title: 'Lịch tổng', to: '/partner/calendar', icon: CalendarDays, permission: 'partner.bookings.read' },
  { title: 'Lượt đặt', to: '/partner/bookings', icon: CalendarCheck, permission: 'partner.bookings.read' },
  { title: 'Tin đăng', to: '/partner/listings', icon: Store, permission: 'partner.listings.read' },
  { title: 'Doanh thu', to: '/partner/revenue', icon: Wallet, permission: 'partner.finance.read' },
  { title: 'Khuyến mãi', to: '/partner/promotions', icon: Ticket, permission: 'partner.promotions.manage' },
  { title: 'Hồ sơ', to: '/partner/profile', icon: ContactRound, permission: 'partner.profile.manage' },
];
