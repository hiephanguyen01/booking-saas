# Simple Icons Brand Icon Migration

## Goal

Replace deprecated or approximate Lucide brand icons in the storefront footer with the official
Simple Icons glyphs and the brand colors published by the installed `simple-icons` package.

## Scope

- Add `simple-icons` as a direct dependency of `@booking/storefront`.
- Replace the footer's Facebook, Instagram, TikTok, and YouTube glyphs.
- Keep Lucide for non-brand interface icons such as mail and phone.
- Preserve the existing social links, accessible labels, focus styles, spacing, and icon size.

## Design

The footer will import the four named `SimpleIcon` exports from `simple-icons`. A typed mapping from
the existing `SocialKey` union to those icon definitions will remain next to the footer component.
`SocialIcon` will render a decorative SVG with the package's `path` as its path data, the standard
`0 0 24 24` view box, and `#${icon.hex}` as its fill color.

Both the glyph and its color therefore come from the installed library rather than duplicated local
constants. Upgrading `simple-icons` will update the library-owned icon metadata without requiring a
second color configuration in BookingOS.

## Error and compatibility considerations

The mapping is exhaustive over `SocialKey`, so TypeScript will report a missing icon if the supported
social networks change. The SVG is `aria-hidden` because the parent link already supplies the network
name through `aria-label`. TikTok's package-provided black brand color is intentionally retained even
on tenant-controlled backgrounds, as exact Simple Icons brand colors are a requirement.

## Verification

No automated tests will be added, per ADR 0005. Verification consists of the storefront lint,
typecheck, security gate, production build, and a source scan confirming no Lucide brand imports or
placeholder TikTok icon remain.
