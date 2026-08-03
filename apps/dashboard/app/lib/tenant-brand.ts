import type { CSSProperties } from 'react';
import type {
  DashboardBrandConfig,
  ScopeMembership,
  SessionInfoResponse,
} from '@booking/contracts';
import { BRAND_DEFAULTS, brandSwatch, sanitizeBrandFont } from '@booking/ui/lib/brand-theme';

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
 * Dashboard-safe brand tokens, resolved through the same
 * `@booking/ui/lib/brand-theme` rules as the storefront — so one tenant config
 * yields one brand on both surfaces, and an unmeasurable colour falls back to
 * the platform default in both instead of silently doing nothing here.
 *
 * The tenant **background** is intentionally ignored: an operational console
 * keeps its neutral surfaces and its dark-mode semantics. That is the one
 * deliberate difference from `themeCss`.
 */
export function tenantBrandStyle(theme: DashboardBrandConfig | null): BrandProperties | undefined {
  if (!theme) return undefined;
  const primary = brandSwatch(theme.colors?.primary, BRAND_DEFAULTS.primary);
  const accent = brandSwatch(theme.colors?.accent, BRAND_DEFAULTS.accent);
  const font = sanitizeBrandFont(theme.font);

  const style: BrandProperties = {
    '--primary': primary.color,
    '--primary-foreground': primary.foreground,
    '--sidebar-primary': primary.color,
    '--sidebar-primary-foreground': primary.foreground,
    // Focus rings follow the primary everywhere. The sidebar used to ring in the
    // accent, so focus changed colour as you tabbed out of the nav.
    '--ring': primary.color,
    '--sidebar-ring': primary.color,
    // Matches the storefront's `--sf-accent`: available to hand-rolled tenant
    // accents, and deliberately NOT mapped onto shadcn's `--accent`, which is
    // the neutral hover surface rather than a brand token.
    '--sf-accent': accent.color,
    '--sf-accent-foreground': accent.foreground,
  };

  if (font) style.fontFamily = font;
  return style;
}
