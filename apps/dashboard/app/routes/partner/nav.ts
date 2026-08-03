import {
  CalendarCheck,
  CalendarDays,
  ContactRound,
  LayoutDashboard,
  Store,
  Ticket,
  Undo2,
  Wallet,
  Star,
  Heart,
  Scale,
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
        activePrefixes: [dashboardPaths.partner.listingGroups],
        icon: Store,
        permission: 'partner.listings.read',
      },
      {
        title: 'Chính sách huỷ',
        to: dashboardPaths.partner.cancellationPolicies,
        icon: Undo2,
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
        title: 'Đánh giá',
        to: dashboardPaths.partner.reviews,
        icon: Star,
        permission: 'partner.reviews.read',
      },
      {
        title: 'Yêu thích',
        to: dashboardPaths.partner.favorites,
        icon: Heart,
        permission: 'partner.favorites.read',
      },
      {
        title: 'Khiếu nại',
        to: dashboardPaths.partner.disputes,
        icon: Scale,
        permission: 'partner.disputes.read',
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
