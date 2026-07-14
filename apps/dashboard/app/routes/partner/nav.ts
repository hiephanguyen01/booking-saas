import { CalendarCheck, CalendarDays, ContactRound, LayoutDashboard, Store, Ticket, Wallet } from 'lucide-react';
import type { DashboardNavSection } from '~/lib/navigation-types';

// Sidebar nav for the partner area (Task 1.14), grouped into labelled sections.
// OWNED by the partner agent — add a screen to the right section. Keep the
// overview cluster (no label) first.
export const partnerNavSections: DashboardNavSection[] = [
  { items: [{ title: 'Tổng quan', to: '/partner', icon: LayoutDashboard }] },
  {
    label: 'Vận hành',
    items: [
      { title: 'Lịch tổng', to: '/partner/calendar', icon: CalendarDays, permission: 'partner.bookings.read' },
      { title: 'Lượt đặt', to: '/partner/bookings', icon: CalendarCheck, permission: 'partner.bookings.read' },
      { title: 'Tin đăng', to: '/partner/listings', icon: Store, permission: 'partner.listings.read' },
    ],
  },
  {
    label: 'Kinh doanh',
    items: [
      { title: 'Doanh thu', to: '/partner/revenue', icon: Wallet, permission: 'partner.finance.read' },
      { title: 'Khuyến mãi', to: '/partner/promotions', icon: Ticket, permission: 'partner.promotions.manage' },
    ],
  },
  {
    label: 'Tài khoản',
    items: [{ title: 'Hồ sơ', to: '/partner/profile', icon: ContactRound, permission: 'partner.profile.manage' }],
  },
];
