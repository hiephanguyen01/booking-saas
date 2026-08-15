# BookingOS landing HTML-match design

## Goal

Restyle the existing BookingOS platform landing page so its visual presentation closely matches
`/Users/hiephanguyen01/Downloads/BookingOS Landing.html`, while preserving the production behavior
already implemented in the React Router storefront.

## Scope

The redesign applies only to the platform landing rendered for the configured BookingOS base domain
(plus local single-label/IP entry points). Unmapped tenant hosts render the unknown-storefront 404
page. The redesign does not change tenant storefront templates, routes, SEO behavior, API contracts,
or the consultation submission flow.

The implementation will preserve:

- Vietnamese and English translations.
- The real dashboard login URL supplied by the root loader.
- Existing consultation-form validation and submission states.
- Keyboard navigation, focus treatment, mobile navigation, FAQ disclosures, and reduced-motion
  behavior.
- Existing StudioHub and BookingStad image assets in place of the reference file's placeholders.

## Reference fidelity

The downloaded HTML is the visual source of truth. The implementation will reproduce its:

- `#F4F5F7` cool-gray page surface, `#0A0E13` ink, and `#FFB020` amber accent.
- Plus Jakarta Sans typography, compact tracking, and weight hierarchy.
- 72px translucent sticky header and 1200px centered content width.
- Pill-shaped primary actions, neutral secondary actions, soft 18-20px content radii, thin cool-gray
  borders, and restrained shadows.
- Section order, section rhythm, responsive composition, and modest reveal motion.
- Asymmetric split hero with a large storefront image and smaller overlapping operations visual.

Exact inline styles from the bundle will not be copied mechanically. They will be expressed through
the project's existing Tailwind/CSS conventions so the page remains maintainable.

## Page structure

The page retains the reference's information architecture:

1. Sticky header and responsive navigation.
2. Split hero with two calls to action and real product imagery.
3. Six supported service models.
4. Before-and-after operational transformation.
5. Four core platform capabilities with varied media compositions.
6. Configure, publish, and grow workflow.
7. StudioHub and BookingStad demos.
8. Pricing consultation state without invented prices.
9. Trust and architecture safeguards.
10. FAQ accordion.
11. Consultation call-to-action and form.
12. Platform footer.

Internal anchors will continue to support the existing navigation labels and behavior even where the
current component IDs differ from the downloaded prototype.

## Responsive behavior

Desktop layouts match the reference at a 1200px content width. Below 768px, split and multi-column
sections collapse to a strict single column, the overlapping hero media becomes a normal document
flow, and navigation moves into the existing accessible mobile menu. Buttons remain single-line
where space allows and become full-width only on narrow screens.

## Motion and accessibility

Motion is limited to entry reveals and tactile hover/active feedback. All animation is disabled or
reduced for `prefers-reduced-motion`. Color contrast, visible focus, semantic headings, form labels,
error association, and disclosure state remain intact.

## Implementation boundaries

Primary changes are expected in:

- `apps/storefront/app/features/platform-landing/components/platform-header.tsx`
- `apps/storefront/app/features/platform-landing/components/platform-sections.tsx`
- `apps/storefront/app/features/platform-landing/components/platform-landing.tsx`
- `apps/storefront/app/features/platform-landing/platform-landing.css`
- Platform locale files only where the reference wording differs materially.

No new runtime dependency is required. Existing Lucide usage is retained because it is already a
project dependency and the reference also uses Lucide-style iconography.

## Verification

The repository's no-tests policy applies. Verification consists of:

- `pnpm check:no-tests`
- Storefront lint and typecheck.
- Storefront production build and security check.
- Visual inspection of the Vietnamese and English platform landing at desktop and mobile widths.
- Interaction checks for navigation, FAQ, consultation validation, and reduced-motion behavior.

## Acceptance criteria

- The rendered page is recognizably the same design as the attached HTML at first glance and through
  every major section.
- The reference palette, typography, container width, spacing, radii, and responsive structure are
  consistently applied.
- No placeholder UI from the reference ships when a real project asset already exists.
- Existing routes, localization, SEO, login, and form behavior do not regress.
- Static checks and the storefront production build pass.
