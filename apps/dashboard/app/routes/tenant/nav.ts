import {
  BookText,
  CalendarCheck,
  CreditCard,
  Files,
  LayoutDashboard,
  Settings,
  Share2,
  Store,
  Tags,
  Ticket,
  Users,
  Wallet,
  Star,
  Heart,
  Scale,
  ReceiptText,
  ShieldAlert,
} from 'lucide-react';
import type { DashboardNavSection } from '~/lib/navigation-types';
import { dashboardPaths } from '~/constants/paths';

// Sidebar nav for the tenant area (Task 1.13), grouped into labelled sections so
// the 11 screens stay scannable. OWNED by the tenant agent — add a screen to the
// section it belongs to. Keep the overview cluster (no label) first. Items with a
// `permission` are hidden by the shell unless the user holds it in tenant scope.
export const tenantNavSections: DashboardNavSection[] = [
  {
    items: [
      {
        title: 'Tổng quan',
        to: dashboardPaths.tenant.home,
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: 'Danh mục',
    items: [
      {
        title: 'Tin đăng',
        to: dashboardPaths.tenant.listings,
        icon: Store,
        permission: 'tenant.listings.read',
      },
      {
        title: 'Tin đăng nhiều hạng mục',
        to: dashboardPaths.tenant.listingGroups,
        icon: Files,
        permission: 'tenant.listings.read',
      },
      {
        title: 'Loại dịch vụ',
        to: dashboardPaths.tenant.listingTypes,
        icon: Tags,
        permission: 'tenant.listings.read',
      },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      {
        title: 'Đặt chỗ',
        to: dashboardPaths.tenant.bookings,
        icon: CalendarCheck,
        permission: 'tenant.bookings.read',
      },
      {
        title: 'Đối tác',
        to: dashboardPaths.tenant.partners,
        icon: Users,
        permission: 'tenant.partners.read',
      },
      {
        title: 'Đánh giá',
        to: dashboardPaths.tenant.reviews,
        icon: Star,
        permission: 'tenant.reviews.read',
      },
      {
        title: 'Yêu thích',
        to: dashboardPaths.tenant.favorites,
        icon: Heart,
        permission: 'tenant.favorites.read',
      },
      {
        title: 'Báo cáo nội dung',
        to: dashboardPaths.tenant.contentReports,
        icon: ShieldAlert,
        permission: 'tenant.listings.publish',
      },
    ],
  },
  {
    label: 'Tài chính',
    items: [
      {
        title: 'Tài chính',
        to: dashboardPaths.tenant.finance,
        icon: Wallet,
        permission: 'tenant.finance.read',
      },
      {
        title: 'Sổ cái',
        to: dashboardPaths.tenant.ledger,
        icon: BookText,
        permission: 'tenant.finance.read',
      },
      {
        title: 'Thuế đối tác',
        to: dashboardPaths.tenant.taxOperations,
        icon: ReceiptText,
        permission: 'tenant.finance.read',
      },
      {
        title: 'Giao dịch',
        to: dashboardPaths.tenant.transactions,
        icon: CreditCard,
        permission: 'tenant.finance.read',
      },
      {
        title: 'Khiếu nại',
        to: dashboardPaths.tenant.disputes,
        icon: Scale,
        permission: 'tenant.disputes.read',
      },
    ],
  },
  {
    label: 'Tiếp thị',
    items: [
      {
        title: 'Khuyến mãi',
        to: dashboardPaths.tenant.promotions,
        icon: Ticket,
        permission: 'tenant.promotions.manage',
      },
      {
        title: 'Cộng tác viên',
        to: dashboardPaths.tenant.affiliates,
        icon: Share2,
        permission: 'tenant.affiliates.manage',
      },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      {
        title: 'Cài đặt',
        to: dashboardPaths.tenant.settings,
        icon: Settings,
        anyPermissions: ['tenant.theme.manage', 'tenant.settings.manage', 'tenant.finance.read'],
      },
    ],
  },
];
