import {
  BookText,
  CalendarCheck,
  Files,
  LayoutDashboard,
  Settings,
  Share2,
  Store,
  Tags,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react';
import type { DashboardNavSection } from '~/lib/navigation-types';
import { dashboardPaths } from '~/lib/paths';

// Sidebar nav for the tenant area (Task 1.13), grouped into labelled sections so
// the 11 screens stay scannable. OWNED by the tenant agent — add a screen to the
// section it belongs to. Keep the overview cluster (no label) first. Items with a
// `permission` are hidden by the shell unless the user holds it in tenant scope.
export function tenantNavSections(tenantId: string): DashboardNavSection[] {
  return [
  {
    items: [
      {
        title: 'Tổng quan',
        to: dashboardPaths.tenant.home(tenantId),
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: 'Danh mục',
    items: [
      {
        title: 'Listing',
        to: dashboardPaths.tenant.listings(tenantId),
        icon: Store,
        permission: 'tenant.listings.read',
      },
      {
        title: 'Bài đăng',
        to: dashboardPaths.tenant.listingGroups(tenantId),
        icon: Files,
        permission: 'tenant.listings.read',
      },
      {
        title: 'Loại dịch vụ',
        to: dashboardPaths.tenant.listingTypes(tenantId),
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
        to: dashboardPaths.tenant.bookings(tenantId),
        icon: CalendarCheck,
        permission: 'tenant.bookings.read',
      },
      {
        title: 'Đối tác',
        to: dashboardPaths.tenant.partners(tenantId),
        icon: Users,
        permission: 'tenant.partners.read',
      },
    ],
  },
  {
    label: 'Tài chính',
    items: [
      {
        title: 'Tài chính',
        to: dashboardPaths.tenant.finance(tenantId),
        icon: Wallet,
        permission: 'tenant.finance.read',
      },
      {
        title: 'Sổ cái',
        to: dashboardPaths.tenant.ledger(tenantId),
        icon: BookText,
        permission: 'tenant.finance.read',
      },
    ],
  },
  {
    label: 'Tiếp thị',
    items: [
      {
        title: 'Khuyến mãi',
        to: dashboardPaths.tenant.promotions(tenantId),
        icon: Ticket,
        permission: 'tenant.promotions.manage',
      },
      {
        title: 'Cộng tác viên',
        to: dashboardPaths.tenant.affiliates(tenantId),
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
        to: dashboardPaths.tenant.settings(tenantId),
        icon: Settings,
        permission: 'tenant.theme.manage',
      },
    ],
  },
  ];
}
