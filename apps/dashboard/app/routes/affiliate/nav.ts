// Affiliate portal tab nav (§15.3). Per-area convention: each area's nav items
// live in routes/<area>/nav.ts (see app/routes.ts). The affiliate portal is
// membership-gated (not RBAC-scoped), so its nav is a flat tab list rather
// than permission-filtered sidebar sections.
export interface AffiliateTab {
  to: string;
  label: string;
  /** NavLink `end` — true for the index tab so it doesn't match children. */
  end: boolean;
}

export const affiliateTabs: AffiliateTab[] = [
  { to: '/affiliate', label: 'Tổng quan', end: true },
  { to: '/affiliate/links', label: 'Link giới thiệu', end: false },
  { to: '/affiliate/commissions', label: 'Hoa hồng', end: false },
];
