# All Service Media Entry Points Design

## Goal

Every media thumbnail on a storefront service-detail page opens one of the two
shared media viewers. This extends the unified viewer behavior to studio room
tables/cards and any room-selection thumbnails that still render static images.

## Scope

- Studio room media in desktop tables and mobile cards.
- Studio room media shown during room selection.
- Existing fixed-package media for photography and makeup.
- Existing listing-level galleries for equipment, costume, model, and other
  standalone listing types.

Search/catalog result cards remain navigation entry points and do not open a
media viewer.

## Viewer Selection

- Media owned by a real package uses `PackageMediaViewerDialog`, including its
  package details panel.
- Media owned by a listing or studio room uses `MediaViewerDialog`.
- Listing-level fallback media continues to use `MediaViewerDialog`.

No third media modal is introduced.

## Component Design

`RoomPhotoStrip` becomes an interactive presentation component. Each available
image is rendered as a button and reports its image index and trigger element
through an `onOpenPhoto` callback. Empty slots remain non-interactive
placeholders.

`RoomOptionsSection` owns one controlled room-media viewer for both its desktop
table and mobile cards. Its state identifies the active room and image index.
The viewer receives the complete room album, opens at the clicked index, and
uses the original trigger reference for focus restoration.

Room-selection UI that renders `RoomPhotoStrip` follows the same controlled
pattern at the nearest parent that can own a single viewer instance. This keeps
navigation, zoom, keyboard behavior, media errors, and focus handling inside
the shared viewer core.

## Data Flow

1. A thumbnail calls `onOpenPhoto(index, trigger)`.
2. The parent stores the room/listing identifier, index, and trigger reference.
3. The parent derives `MediaViewerItem[]` from the selected room's current
   photos.
4. `MediaViewerDialog` opens with the controlled active index.
5. Navigation updates the controlled index.
6. Closing clears the active media state and restores focus to the trigger.

## Accessibility and Responsive Behavior

- Every image button receives a localized label containing the service name and
  one-based image index.
- Keyboard focus styles remain visible.
- Desktop table and mobile card entry points open the same viewer instance.
- Existing full-screen mobile viewer behavior, keyboard navigation, zoom,
  focus trap, and error placeholder remain unchanged.

## Error and Empty States

- A room with no photos retains the current non-interactive empty placeholder.
- Broken media is handled by the shared viewer without disabling navigation.
- Missing active room data closes the controlled viewer safely.

## Verification

Per ADR 0005, no test files or test configuration are added.

- Run `pnpm turbo lint typecheck build`.
- Manually verify studio room table and mobile card thumbnails.
- Verify room-selection thumbnails where present.
- Verify photography and makeup package media still use the package viewer.
- Verify equipment, costume, and model listing galleries still use the gallery
  viewer.
- Verify clicked index, boundary navigation, zoom reset, `Esc`, and focus
  restoration.

## Non-Goals

- Opening media directly from catalog/search result cards.
- Adding backend fields, migrations, dependencies, or new viewer variants.
- Changing booking or package-selection behavior.
