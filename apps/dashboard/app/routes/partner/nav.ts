import {
  CalendarCheck,
  CalendarDays,
  ContactRound,
  LayoutDashboard,
  Store,
  Ticket,
  Wallet,
} from 'lucide-react';
import type { DashboardNavSection } from '~/lib/navigation-types';
import { dashboardPaths } from '~/constants/paths';

// Sidebar nav for the partner area (Task 1.14). OWNED by the partner agent -
// append one entry per list screen. Keep the overview item first.
export const partnerNavSections: DashboardNavSection[] = [
  {
    items: [
      {
        title: 'Tổng quan',
        to: dashboardPaths.partner.home,
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      {
        title: 'Lịch tổng',
        to: dashboardPaths.partner.calendar,
        icon: CalendarDays,
        permission: 'partner.bookings.read',
      },
      {
        title: 'Lượt đặt',
        to: dashboardPaths.partner.bookings,
        icon: CalendarCheck,
        permission: 'partner.bookings.read',
      },
      {
        title: 'Tin đăng',
        to: dashboardPaths.partner.listings,
        icon: Store,
        permission: 'partner.listings.read',
      },
    ],
  },
  {
    label: 'Kinh doanh',
    items: [
      {
        title: 'Doanh thu',
        to: dashboardPaths.partner.revenue,
        icon: Wallet,
        permission: 'partner.finance.read',
      },
      {
        title: 'Khuyến mãi',
        to: dashboardPaths.partner.promotions,
        icon: Ticket,
        permission: 'partner.promotions.manage',
      },
    ],
  },
  {
    label: 'Tài khoản',
    items: [
      {
        title: 'Hồ sơ',
        to: dashboardPaths.partner.profile,
        icon: ContactRound,
        permission: 'partner.profile.manage',
      },
    ],
  },
];
