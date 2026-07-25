# All Service Media Entry Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every service-detail media thumbnail open one of the two shared media viewers, including studio room table/card thumbnails and package thumbnails in room booking flows.

**Architecture:** Keep `MediaViewerDialog` and `PackageMediaViewerDialog` as the only media modal types. Convert `RoomPhotoStrip` into a stateless interactive thumbnail presenter; its nearest owning section or dialog stores the selected media item and renders a single controlled viewer. Listing and room media use the gallery viewer; real package media uses the package viewer and existing package-details panel.

**Tech Stack:** React 19, React Router 8, TypeScript, Tailwind CSS, shadcn/Radix dialogs, `@booking/ui`, Lucide.

## Global Constraints

- Do not add test files, test scripts, or test configuration (ADR 0005).
- Do not add dependencies, API fields, contracts, migrations, or another media modal type.
- Use `MediaViewerDialog` for listing/room media and `PackageMediaViewerDialog` only for actual package media.
- Preserve the existing controlled viewer API, zoom/navigation/video behavior, error states, keyboard controls, and focus restoration.
- Catalog and search-result cards remain navigation links; they do not open media viewers.
- Verify with `pnpm turbo lint typecheck build` and manual browser checks.

---

## File Structure

- Modify `apps/storefront/app/features/listing-group/components/room-photo-strip.tsx` — render interactive thumbnails and expose the selected image index/trigger to its owner.
- Modify `apps/storefront/app/features/listing-group/components/room-cells.tsx` — forward room-image callbacks from the desktop table row.
- Modify `apps/storefront/app/features/listing-group/components/room-options-section.tsx` — own one gallery viewer for the desktop room table and mobile room cards.
- Modify `apps/storefront/app/features/listing-group/components/room-booking-dialog-steps.tsx` — expose the selected real package thumbnail as a package-viewer entry point.
- Modify `apps/storefront/app/features/listing-group/components/room-booking-dialog.tsx` — own one package viewer while the booking dialog is open and supply the existing package details panel.

### Task 1: Make studio room thumbnails interactive

**Files:**
- Modify: `apps/storefront/app/features/listing-group/components/room-photo-strip.tsx`
- Modify: `apps/storefront/app/features/listing-group/components/room-cells.tsx`
- Modify: `apps/storefront/app/features/listing-group/components/room-options-section.tsx`

**Interfaces:**
- Consumes: `MediaViewerDialog`, `MediaViewerItem`, `useMediaViewerLabels`, `RoomOption`.
- Produces: `RoomPhotoStrip({ photos, title, onOpenPhoto? })`, where `onOpenPhoto(index, trigger)` receives a zero-based media index and clicked button.
- Produces: a single `MediaViewerDialog` controlled by `RoomOptionsSection` for every desktop and mobile room thumbnail.

- [x] **Step 1: Extend the photo-strip interface without changing empty states.**

```tsx
export function RoomPhotoStrip({
  photos,
  title,
  onOpenPhoto,
}: {
  photos: string[];
  title: string;
  onOpenPhoto?: (index: number, trigger: HTMLButtonElement) => void;
})
```

Keep the current non-interactive placeholder when `photos[0]` is absent. When `onOpenPhoto` is absent, keep images non-interactive for compatibility.

- [x] **Step 2: Render each available image as a labeled button when a callback exists.**

```tsx
<button
  type="button"
  onClick={(event) => onOpenPhoto?.(index, event.currentTarget)}
  aria-label={t('packages.viewPackagePhoto', { name: title, index: index + 1 })}
  className="relative min-h-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
>
  <img src={photo} alt={index === 0 ? title : ''} className="size-full object-cover" />
</button>
```

Use localized viewer-style labels for all three slots, preserve the current grid dimensions, and retain empty slot placeholders.

- [x] **Step 3: Thread `onOpenPhoto` through `RoomDetails` and both room presentations.**

```tsx
export function RoomDetails({
  option,
  hidePhotos = false,
  onOpenPhoto,
}: {
  option: RoomOption;
  hidePhotos?: boolean;
  onOpenPhoto?: (index: number, trigger: HTMLButtonElement) => void;
})
```

Pass the callback to the desktop `RoomDetails` strip and directly to the mobile `RoomPhotoStrip`; leave `hidePhotos` behavior unchanged.

- [x] **Step 4: Add controlled room-media state to `RoomOptionsSection`.**

```tsx
const [activeMedia, setActiveMedia] = useState<{ roomId: string; index: number } | null>(null);
const mediaTriggerRef = useRef<HTMLButtonElement | null>(null);
const activeRoom = activeMedia
  ? visibleOptions.find((option) => option.child.id === activeMedia.roomId) ?? null
  : null;
const mediaItems: MediaViewerItem[] = activeRoom?.child.photos.map((url, index) => ({
  kind: 'image',
  url,
  alt: t('group.photoAlt', { title: activeRoom.child.title, index: index + 1 }),
})) ?? [];
```

Define `openRoomMedia(roomId, index, trigger)` to save the trigger ref and active state, then pass it to each `RoomRow` and `RoomCard`.

- [x] **Step 5: Mount one gallery viewer at the section boundary.**

```tsx
<MediaViewerDialog
  open={Boolean(activeRoom)}
  items={mediaItems}
  activeIndex={activeMedia?.index ?? 0}
  onOpenChange={(open) => !open && setActiveMedia(null)}
  onActiveIndexChange={(index) =>
    setActiveMedia((current) => (current ? { ...current, index } : current))
  }
  labels={viewerLabels}
  title={activeRoom?.child.title ?? t('group.roomTypes')}
  returnFocusRef={mediaTriggerRef}
/>
```

Use the existing `useMediaViewerLabels()` hook. The gallery must safely close if the active room is no longer visible after availability filtering.

- [x] **Step 6: Run focused static checks.**

Run: `pnpm --filter=@booking/storefront lint && pnpm --filter=@booking/storefront typecheck`

Expected: both commands exit 0 with no TypeScript or ESLint errors.

- [x] **Step 7: Commit the room-table viewer work.**

```bash
git add apps/storefront/app/features/listing-group/components/room-photo-strip.tsx \
  apps/storefront/app/features/listing-group/components/room-cells.tsx \
  apps/storefront/app/features/listing-group/components/room-options-section.tsx
git commit -m "feat(storefront): open studio room media viewer"
```

### Task 2: Make package thumbnails in room booking flows interactive

**Files:**
- Modify: `apps/storefront/app/features/listing-group/components/room-booking-dialog-steps.tsx`
- Modify: `apps/storefront/app/features/listing-group/components/room-booking-dialog.tsx`

**Interfaces:**
- Consumes: `PackageMediaViewerDialog`, `PackageMediaDetails`, `MediaViewerItem`, `useMediaViewerLabels`, `PublicPackageOption`, `PublicListingDetailResponse`.
- Produces: `RoomBookingDialogSteps` prop `onOpenPackageMedia(index, trigger)` for the selected package album.
- Produces: one controlled package viewer next to `RoomBookingDialogShell`.

- [x] **Step 1: Add an explicit viewer callback to `RoomBookingDialogSteps`.**

```tsx
onOpenPackageMedia: (index: number, trigger: HTMLButtonElement) => void;
```

Pass it to the selected package strip:

```tsx
<RoomPhotoStrip
  photos={selectedPackageGallery.photos}
  title={selectedPackageGallery.title}
  onOpenPhoto={onOpenPackageMedia}
/>
```

Do not make the package-selection row itself open the viewer: it remains the package-selection control.

- [x] **Step 2: Own selected package media state in `ListingBookingDialog`.**

```tsx
const [activePackageMediaIndex, setActivePackageMediaIndex] = useState<number | null>(null);
const mediaTriggerRef = useRef<HTMLButtonElement | null>(null);
const selectedPackage = stepsProps.selectedPackage;
const mediaItems: MediaViewerItem[] = selectedPackage?.photos.map((url, index) => ({
  kind: 'image',
  url,
  alt: t('group.photoAlt', { title: selectedPackage.name, index: index + 1 }),
})) ?? [];
```

Pass `onOpenPackageMedia` into `RoomBookingDialogSteps` by composing `stepsProps` with the handler. The handler stores the trigger and image index.

- [x] **Step 3: Render the controlled package viewer outside the booking shell.**

```tsx
<PackageMediaViewerDialog
  open={activePackageMediaIndex !== null && Boolean(selectedPackage)}
  items={mediaItems}
  activeIndex={activePackageMediaIndex ?? 0}
  onOpenChange={(open) => !open && setActivePackageMediaIndex(null)}
  onActiveIndexChange={setActivePackageMediaIndex}
  labels={viewerLabels}
  title={selectedPackage?.name ?? listing.title}
  returnFocusRef={mediaTriggerRef}
  details={selectedPackage ? <PackageMediaDetails item={selectedPackage} listing={listing} /> : null}
/>
```

Close the media viewer when the booking dialog closes so it never leaves an orphaned overlay. Keep `RoomBookingDialogShell` ownership of booking state unchanged.

- [x] **Step 4: Run focused static checks.**

Run: `pnpm --filter=@booking/storefront lint && pnpm --filter=@booking/storefront typecheck`

Expected: both commands exit 0 with no TypeScript or ESLint errors.

- [x] **Step 5: Commit the room-booking package viewer work.**

```bash
git add apps/storefront/app/features/listing-group/components/room-booking-dialog-steps.tsx \
  apps/storefront/app/features/listing-group/components/room-booking-dialog.tsx
git commit -m "feat(storefront): open package media from room booking"
```

### Task 3: End-to-end verification

**Files:**
- No source files expected.

**Interfaces:**
- Consumes: the two controlled viewer integrations from Tasks 1–2.
- Produces: verified storefront behavior for all service-detail media entry points.

- [x] **Step 1: Run the repository verification suite.**

Run: `pnpm turbo lint typecheck build`

Expected: all lint, typecheck, and build tasks exit 0. Build-time pre-existing sourcemap notices may be reported but must not fail the build.

- [x] **Step 2: Manually verify studio room entry points.**

Open a studio group detail page at desktop and mobile widths. Click the cover, second, and third images in both the desktop room table and mobile room card. Confirm each opens the gallery viewer at its clicked index, arrows stop at boundaries, `Esc` restores focus to the clicked thumbnail, and zoom resets when the image changes.

- [x] **Step 3: Manually verify package and standalone listing behavior.**

Open photography and makeup listings: package table/album thumbnails and the selected package strip in their booking dialog must use the package viewer with a details panel. Open equipment, costume, and model listings: their main gallery must use the gallery viewer. Confirm catalog/search cards still navigate instead of opening a viewer.

- [x] **Step 4: Commit verification-only changes if any were required.**

If no source changes were needed, do not create an empty commit. If a small correction was required during manual verification, stage only that correction and commit it with a focused `fix(storefront): ...` message.
