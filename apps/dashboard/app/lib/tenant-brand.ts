import type {
  DashboardBrandConfig,
  ScopeMembership,
  SessionInfoResponse,
} from '@booking/contracts';
import { BRAND_DEFAULTS, brandSwatch, sanitizeBrandFont } from '@booking/ui/lib/brand-theme';

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
 * **Emitted as a stylesheet, not an inline `style` on the shell.** Radix renders
 * every dropdown, dialog, select, popover, tooltip — and the mobile sidebar,
 * which is a Sheet — through a portal at `document.body`, outside whatever
 * wrapper we could put a `style` attribute on. An inline style therefore never
 * reached any of them: they all fell back to the platform brand. That was
 * invisible while the platform default was a near-black `--primary` that read as
 * a neutral, and obvious the moment it became amber — the colour was wrong the
 * whole time. A `:root` rule reaches the portals because they inherit from the
 * document root like everything else.
 *
 * Interpolating into CSS is safe here for the same reason it is in the
 * storefront's `themeCss`: every value has been through `brandSwatch` /
 * `sanitizeBrandFont`, which reject anything that is not a measurable colour or
 * a plain font name, so no tenant string can close the rule or the `<style>`.
 *
 * The tenant **background** is intentionally ignored: an operational console
 * keeps its neutral surfaces and its dark-mode semantics. That is the one
 * deliberate difference from `themeCss`.
 */
export function tenantBrandCss(theme: DashboardBrandConfig | null): string | null {
  if (!theme) return null;
  const primary = brandSwatch(theme.colors?.primary, BRAND_DEFAULTS.primary);
  const accent = brandSwatch(theme.colors?.accent, BRAND_DEFAULTS.accent);
  const font = sanitizeBrandFont(theme.font);

  const decls = [
    `--primary:${primary.color}`,
    `--primary-foreground:${primary.foreground}`,
    `--sidebar-primary:${primary.color}`,
    `--sidebar-primary-foreground:${primary.foreground}`,
    // Focus rings follow the primary everywhere. The sidebar used to ring in the
    // accent, so focus changed colour as you tabbed out of the nav.
    `--ring:${primary.color}`,
    `--sidebar-ring:${primary.color}`,
    // Matches the storefront's `--sf-accent`: available to hand-rolled tenant
    // accents, and deliberately NOT mapped onto shadcn's `--accent`, which is
    // the neutral hover surface rather than a brand token.
    `--sf-accent:${accent.color}`,
    `--sf-accent-foreground:${accent.foreground}`,
  ];
  // A custom face reaches portalled surfaces the same way, through `body` in
  // `app.css` rather than an inline `fontFamily` that stopped at the shell.
  if (font) decls.push(`--font-tenant:${font}`);

  return `:root{${decls.join(';')}}`;
}
