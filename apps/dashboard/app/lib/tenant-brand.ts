import type { CSSProperties } from 'react';
import type {
  DashboardBrandConfig,
  ScopeMembership,
  SessionInfoResponse,
} from '@booking/contracts';
import {
  brandContrastForeground,
  sanitizeBrandColor,
  sanitizeBrandFont,
} from '@booking/ui/lib/brand-theme';

type BrandProperties = CSSProperties & Record<`--${string}`, string>;

/** Resolve the parent tenant brand for the dashboard area currently on screen. */
export function activeTenantMembership(
  info: SessionInfoResponse,
  pathname: string,
): ScopeMembership | null {
  const scope = pathname.startsWith('/partner')
    ? 'partner'
    : pathname.startsWith('/tenant')
      ? 'tenant'
      : null;
  return scope ? (info.scopes.find((membership) => membership.scope === scope) ?? null) : null;
}

/**
 * Dashboard-safe brand tokens. Storefront background is intentionally ignored:
 * an operational console retains its neutral surfaces and dark-mode semantics.
 */
export function tenantBrandStyle(theme: DashboardBrandConfig | null): BrandProperties | undefined {
  if (!theme) return undefined;
  const primary = sanitizeBrandColor(theme.colors?.primary);
  const foreground = primary ? brandContrastForeground(primary) : null;
  const accent = sanitizeBrandColor(theme.colors?.accent);
  const font = sanitizeBrandFont(theme.font);
  const style: BrandProperties = {};

  if (primary && foreground) {
    style['--primary'] = primary;
    style['--primary-foreground'] = foreground;
    style['--ring'] = primary;
    style['--sidebar-primary'] = primary;
    style['--sidebar-primary-foreground'] = foreground;
  }
  if (accent) {
    style['--tenant-accent'] = accent;
    style['--sidebar-ring'] = accent;
  }
  if (font) style.fontFamily = font;
  return Object.keys(style).length > 0 ? style : undefined;
}
