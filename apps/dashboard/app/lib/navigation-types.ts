import type { ScopeLevel } from '@booking/shared';
import type { LucideIcon } from 'lucide-react';

export interface DashboardNavItem {
  title: string;
  /** Absolute path within the area (e.g. '/admin/tenants'). */
  to: string;
  icon?: LucideIcon;
  /**
   * Optional permission key required to see this item. When set, the sidebar
   * hides it unless the user holds the permission in that area's scope.
   */
  permission?: string;
}

export interface DashboardArea {
  scope: ScopeLevel;
  title: string;
  description: string;
  /** Area root path — the `_layout.tsx` route base. */
  basePath: string;
  icon: LucideIcon;
  /** Nav items for the area — sourced from the area's own `routes/<area>/nav.ts`. */
  items: DashboardNavItem[];
}
