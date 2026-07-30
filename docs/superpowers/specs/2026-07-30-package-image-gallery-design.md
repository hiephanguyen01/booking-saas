# Package Image Gallery UI Design

## Goal

Improve the package image gallery inside the partner listing create/edit form so images are easier
to inspect and manage without changing upload behavior, drag-and-drop behavior, form values, or API
payloads.

## Design Direction

Use a compact, refined thumbnail grid consistent with the existing BookingOS dashboard. The gallery
should prioritize the image itself, keep actions visually quiet until needed, and preserve clear
touch and keyboard interaction.

## Layout

- Render each completed image in a consistent 4:3 thumbnail.
- Use a responsive grid rather than the current loose wrapping row:
  - two columns on narrow mobile;
  - three columns when the package card has enough width;
  - four columns on wide package cards.
- Render the upload trigger as the next grid item with the same aspect ratio as an image.
- Keep the gallery within the package card width and prevent horizontal overflow.
- Show one compact metadata row below the grid: `{current}/{maximum} ảnh` followed by the reorder
  instruction when reordering is available.

## Image Tile

- Use a subtle border, dashboard radius, muted background, and restrained shadow.
- Keep the image edge-to-edge with `object-cover`.
- Mark the first image with a compact brand-colored `Ảnh đại diện` badge at the top-left.
- Place the drag handle at the top-right. Its visible surface may be compact, but its interactive
  target remains at least 44 by 44 pixels.
- Place view and delete actions over a shallow bottom gradient.
- On pointer devices, reveal secondary actions on hover or focus-within.
- On touch devices, keep the secondary actions visible.
- Use opacity and a primary ring as drag feedback, consistent with the main listing gallery.

## Upload Tile and States

- The upload tile uses a dashed border, upload icon, and `Thêm ảnh` label.
- Hover, focus, drag-over, disabled, uploading, and limit states continue to use existing dashboard
  tokens.
- Pending and failed uploads occupy normal grid cells and match the thumbnail aspect ratio.
- Failed uploads retain the existing error message and dismiss action.
- When the maximum is reached, omit the upload tile and show the existing limit message.

## Interaction and Accessibility

- Keep drag initiation restricted to the handle.
- Preserve pointer, touch, and keyboard sorting supplied by the shared sortable primitive.
- Preserve accessible names for drag, view, delete, upload, and dismiss controls.
- All action controls remain `type="button"` and keep visible focus rings.
- Delete uses destructive color only on hover/focus, avoiding a permanently alarming gallery.
- No operation in the nested gallery may initiate package-card sorting.

## Component Scope

- Add a compact gallery presentation to `ImageUpload` for package images.
- Select that presentation from `PackageEditor`.
- Do not alter the listing-level `gallery` variant, the document variant, or unrelated default
  upload consumers.
- Do not change `ImageUpload` values, presign/upload flow, maximum image count, React Hook Form
  integration, contracts, API, or database.

## Verification

No test files will be added, per project policy. Verify with:

- `pnpm check:no-tests`
- `pnpm check:frontend-structure`
- `pnpm --filter=@booking/ui lint`
- `pnpm --filter=@booking/ui typecheck`
- `pnpm --filter=@booking/dashboard lint`
- `pnpm --filter=@booking/dashboard typecheck`
- `pnpm --filter=@booking/dashboard build`
- Manual create/edit checks at desktop and mobile widths for layout, hover/focus/touch visibility,
  upload states, image deletion/viewing, nested drag sorting, cover badge updates, and overflow.
