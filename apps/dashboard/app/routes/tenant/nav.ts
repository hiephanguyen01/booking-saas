import {
  LayoutDashboard,
  Store,
  CalendarCheck,
  Wallet,
  BookText,
  Ticket,
  Settings,
} from 'lucide-react';
import type { DashboardNavItem } from '~/lib/navigation-types';

// Sidebar nav for the tenant area (Task 1.13). OWNED by the tenant agent —
// append one entry per list screen. Keep the overview item first. Items with a
// `permission` are hidden by the shell unless the user holds it in tenant scope.
export const tenantNavItems: DashboardNavItem[] = [
  { title: 'Tổng quan', to: '/tenant', icon: LayoutDashboard },
  { title: 'Listing', to: '/tenant/listings', icon: Store, permission: 'tenant.listings.read' },
  { title: 'Đặt chỗ', to: '/tenant/bookings', icon: CalendarCheck, permission: 'tenant.bookings.read' },
  { title: 'Tài chính', to: '/tenant/finance', icon: Wallet, permission: 'tenant.finance.read' },
  { title: 'Sổ cái', to: '/tenant/finance/ledger', icon: BookText, permission: 'tenant.finance.read' },
  { title: 'Khuyến mãi', to: '/tenant/promotions', icon: Ticket, permission: 'tenant.promotions.manage' },
  { title: 'Cài đặt', to: '/tenant/settings', icon: Settings, permission: 'tenant.theme.manage' },
];
