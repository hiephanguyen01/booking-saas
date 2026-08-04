import type { ThemeConfigInput } from '@booking/contracts';
import {
  BRAND_DEFAULTS,
  brandNeutrals,
  brandSwatch,
  sanitizeBrandColor,
  sanitizeBrandFont,
  sanitizeBrandLength,
  sanitizeBrandShadow,
} from '@booking/ui/lib/brand-theme';

/**
 * Tenant theming via CSS variables (TONG-QUAN.md §16.2). The tenant's
 * `theme_config` drives the shadcn base tokens, so every `@booking/ui` component
 * and every storefront surface re-skins from one config with no rebuild — the
 * block is emitted once at SSR into `<style>:root{…}</style>` (see root.tsx).
 *
 * Three rules hold this together:
 *
 * 1. **The tenant sets surfaces, never ink.** Foregrounds and the whole neutral
 *    ramp are derived (`brandNeutrals`), so a dark background produces a coherent
 *    dark storefront and no combination of settings yields unreadable text.
 * 2. **Every value is re-validated here, not at the schema.** `theme_config` is
 *    tenant-controlled jsonb landing in a `<style>` block; the contract checks
 *    shape and length, and these sanitizers check grammar and range.
 * 3. **An invalid value falls back, it never disables the token.** A half-applied
 *    theme is harder to diagnose than one that ignored a bad field.
 *
 * `--accent` stays neutral (it is shadcn's hover/focus surface, not a brand
 * colour); the tenant's brand accent lives on `--sf-accent*`.
 *
 * Channel resolution is shared with the dashboard through
 * `@booking/ui/lib/brand-theme`, so both frontends make the same brand out of one
 * tenant config.
 */

const DEFAULT_FONT = "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif";

/**
 * Ranges, not just units. The upper bounds are what keeps a mistyped value a
 * styling choice instead of an unusable page — a 400px card radius turns every
 * panel into a circle, and a 0.5px border vanishes on a non-retina screen.
 */
const LENGTH_LIMITS = {
  radius: { minPx: 0, maxPx: 32 },
  imageRadius: { minPx: 0, maxPx: 32 },
  borderWidth: { minPx: 0, maxPx: 4 },
  cardPadding: { minPx: 0, maxPx: 48 },
  sectionGap: { minPx: 0, maxPx: 64 },
  baseSize: { minPx: 12, maxPx: 20 },
} as const;

const SURFACE_FALLBACKS = {
  radius: '0.625rem',
  imageRadius: '0.5rem',
  borderWidth: '1px',
  shadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  cardPadding: '1rem',
  sectionGap: '1rem',
  baseSize: '16px',
} as const;

function length(
  value: unknown,
  limits: { minPx: number; maxPx: number },
  fallback: string,
): string {
  return sanitizeBrandLength(value, limits) ?? fallback;
}

/** Build the `:root { … }` CSS that re-skins the storefront for one tenant. */
export function themeCss(theme: ThemeConfigInput): string {
  const primary = brandSwatch(theme.colors?.primary, BRAND_DEFAULTS.primary);
  const accent = brandSwatch(theme.colors?.accent, BRAND_DEFAULTS.accent);
  const background = brandSwatch(theme.colors?.background, BRAND_DEFAULTS.background);
  const font = sanitizeBrandFont(theme.font) ?? DEFAULT_FONT;
  const surface = theme.surface;

  const radius = length(surface?.radius, LENGTH_LIMITS.radius, SURFACE_FALLBACKS.radius);
  const decls: string[] = [
    `--background:${background.color}`,
    `--foreground:${background.foreground}`,
    `--primary:${primary.color}`,
    `--primary-foreground:${primary.foreground}`,
    `--ring:${primary.color}`,
    `--font-tenant:${font}`,

    // Radius: one value the whole `--radius-*` scale derives from, so 236 uses of
    // `rounded-sm/md/lg/xl` across the storefront and `@booking/ui` follow it.
    `--radius:${radius}`,

    // Kept in step with the dashboard's `tenant-brand.ts`, which emits the same
    // pair — one tenant config has to make one brand in both frontends. The
    // matching `*-soft` mixes were dropped: neither app has ever read them.
    `--sf-accent:${accent.color}`,
    `--sf-accent-foreground:${accent.foreground}`,

    // Surface shape for the storefront's own panels, which are hand-rolled rather
    // than shadcn components and so have no token of their own to inherit.
    `--sf-surface-radius:${radius}`,
    `--sf-image-radius:${length(surface?.imageRadius, LENGTH_LIMITS.imageRadius, SURFACE_FALLBACKS.imageRadius)}`,
    `--sf-surface-border-width:${length(surface?.borderWidth, LENGTH_LIMITS.borderWidth, SURFACE_FALLBACKS.borderWidth)}`,
    `--sf-surface-border-color:${sanitizeBrandColor(surface?.borderColor) ?? 'var(--border)'}`,
    `--sf-surface-shadow:${sanitizeBrandShadow(surface?.shadow) ?? SURFACE_FALLBACKS.shadow}`,
    `--sf-surface-pad:${length(surface?.cardPadding, LENGTH_LIMITS.cardPadding, SURFACE_FALLBACKS.cardPadding)}`,
    `--sf-section-gap:${length(surface?.sectionGap, LENGTH_LIMITS.sectionGap, SURFACE_FALLBACKS.sectionGap)}`,
    `--sf-base-size:${length(theme.baseSize, LENGTH_LIMITS.baseSize, SURFACE_FALLBACKS.baseSize)}`,
  ];

  // Derived last so they can reference the `--background`/`--foreground` above.
  for (const [token, value] of Object.entries(brandNeutrals(background.color))) {
    decls.push(`${token}:${value}`);
  }

  return `:root{${decls.join(';')}}`;
}
