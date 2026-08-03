import type { ScopeLevel } from '@booking/contracts';
import type { LucideIcon } from 'lucide-react';

export interface DashboardNavItem {
  title: string;
  /** Absolute path within the area (e.g. dashboardPaths.admin.tenants). */
  to: string;
  icon?: LucideIcon;
  /**
   * Optional permission key required to see this item. When set, the sidebar
   * hides it unless the user holds the permission in that area's scope.
   */
  permission?: string;
  /** Show the item when the user holds at least one of these permissions. */
  anyPermissions?: string[];
  /** Additional route prefixes that should keep this item highlighted. */
  activePrefixes?: string[];
}

/**
 * A labelled cluster of nav items within an area. The first section of an area
 * usually omits `label` (it holds the overview item) — the sidebar falls back to
 * the area title for it. Every other section renders its own sub-heading, which
 * is what keeps a long area (Tenant has 11 screens) readable.
 */
export interface DashboardNavSection {
  /** Section heading; omit for the leading overview cluster. */
  label?: string;
  items: DashboardNavItem[];
}

export interface DashboardArea {
  /** Flattened visible items, retained for overview/tests and simple consumers. */
  items: DashboardNavItem[];
  scope: ScopeLevel;
  title: string;
  description: string;
  /** Area root path — the `_layout.tsx` route base. */
  basePath: string;
  icon: LucideIcon;
  /** Nav sections for the area — sourced from the area's own `routes/<area>/nav.ts`. */
  sections: DashboardNavSection[];
}
