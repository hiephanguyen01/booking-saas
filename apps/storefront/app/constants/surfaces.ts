/**
 * The tenant-configurable panel surface: radius, border and shadow all read the
 * `--sf-surface-*` tokens, so a tenant that configures a rounded, bordered look
 * gets it on every panel that opts in.
 *
 * A cross-feature constant rather than an account one. It began in
 * `features/account`, but the booking detail sections it styles are now shared
 * with the guest lookup under `features/booking` — and a booking module reaching
 * into an account module to find its own background is the kind of import that
 * makes a feature boundary meaningless.
 *
 * Unpadded on purpose: callers pick their own padding. `SectionCard` is the
 * padded sibling for content that wants the surface and the standard inset
 * together.
 *
 * Always apply it through `cn()`, never template concatenation, so a caller's
 * override actually replaces the token class instead of both shipping and CSS
 * source order picking the winner.
 */
export const PANEL_SURFACE =
  'rounded-(--sf-surface-radius) [border:var(--sf-surface-border-width)_solid_var(--sf-surface-border-color)] bg-background shadow-(--sf-surface-shadow)';
