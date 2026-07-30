# Compact Package Image Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visually crowded package image uploader with a compact responsive thumbnail
grid while preserving upload, sorting, accessibility, and submitted URL values.

**Architecture:** Add a dedicated `compact-gallery` presentation variant to the shared
`ImageUpload` component so existing default, document, and listing gallery consumers remain
unchanged. `PackageEditor` opts into the new variant and delegates all upload, removal, and reorder
state to the existing controlled `ImageUpload` API.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, lucide-react, `@dnd-kit/react@0.5.0`,
BookingOS UI primitives.

## Global Constraints

- Do not add test files, test configuration, or test scripts.
- Do not change contracts, API endpoints, database models, upload payloads, or React Hook Form
  integration.
- Keep image values as `string[]`; the first URL remains the package cover.
- Dragging starts only from the sortable handle.
- Interactive targets remain at least 44 by 44 pixels and retain accessible names and focus rings.
- Preserve unrelated staged and unstaged work in the current worktree.

---

### Task 1: Add the compact gallery presentation

**Files:**

- Modify: `packages/ui/src/components/form/image-upload.tsx`

**Interfaces:**

- Consumes: existing `ImageUploadProps`, `SortableCollection`, `SortableImageItem`,
  `SortableHandle`, `GalleryAction`, `handleFiles`, `removeAt`, and `move`.
- Produces: `ImageUploadProps['variant']` accepting `'compact-gallery'`.
- Preserves: `onChange(value: string | string[])`, upload targets, URL order, pending state, and all
  existing variants.

- [ ] **Step 1: Extend the variant contract**

Change the variant declaration to:

```tsx
variant?: 'default' | 'document' | 'gallery' | 'compact-gallery';
```

- [ ] **Step 2: Build the completed-image tile**

Before the existing `document` and default branches, add a `compact-gallery` branch. Render each
stable image through the existing sortable wrapper and use this visual structure:

```tsx
<SortableImageItem
  key={item.id}
  id={item.id}
  index={index}
  sortable={reorderable}
  disabled={disabled || uploading || urls.length < 2}
>
  {({ itemRef, handleRef, isDragging }) => (
    <div
      ref={itemRef}
      className={cn(
        'group/image relative aspect-[4/3] min-w-0 overflow-hidden rounded-xl border bg-muted shadow-xs transition',
        isDragging && 'z-10 opacity-45 ring-2 ring-primary/40',
      )}
    >
      <img
        src={item.url}
        alt={`Ảnh gói ${index + 1}`}
        className="size-full object-cover transition-transform duration-200 group-hover/image:scale-[1.02]"
      />
      {index === 0 ? (
        <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground shadow-sm">
          Ảnh đại diện
        </span>
      ) : null}
      {reorderable ? (
        <SortableHandle
          ref={handleRef}
          label={`Kéo để sắp xếp ảnh gói ${index + 1}`}
          disabled={disabled || uploading || urls.length < 2}
          className="absolute right-1 top-1 z-10 rounded-lg bg-background/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-background"
        />
      ) : null}
      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2 pt-8 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/image:opacity-100 [@media(hover:hover)]:group-focus-within/image:opacity-100">
        {/* 44px view link and delete button with accessible names */}
      </div>
    </div>
  )}
</SortableImageItem>
```

Use an `<a target="_blank" rel="noreferrer">` for `Xem ảnh gói N` and a `type="button"` control for
`Xoá ảnh gói N`. Give delete destructive color only on hover/focus.

- [ ] **Step 3: Build the matched upload tile**

Render the trigger as the next responsive-grid item with `aspect-[4/3]`, a dashed border,
`UploadIcon`, and `Thêm ảnh`. Wire click, drag enter/over/leave, and drop to the existing
`inputRef`, `dragging`, and `handleFiles` flow:

```tsx
<button
  type="button"
  disabled={disabled || uploading}
  onClick={() => inputRef.current?.click()}
  onDragEnter={handleDragEnter}
  onDragOver={(event) => event.preventDefault()}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
  className={cn(
    'group/upload flex aspect-[4/3] min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/15 p-3 text-center text-muted-foreground outline-none transition',
    'hover:border-primary/50 hover:bg-primary/[0.03] hover:text-primary',
    'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
    dragging && 'border-primary bg-primary/[0.06] text-primary ring-[3px] ring-primary/15',
  )}
>
  {uploading ? <Spinner /> : <UploadIcon className="size-5" />}
  <span className="text-xs font-semibold">
    {uploading ? 'Đang tải ảnh…' : 'Thêm ảnh'}
  </span>
</button>
```

Do not render the trigger when `showTrigger` is false.

- [ ] **Step 4: Match pending and error tiles**

Render every `pending` item as an `aspect-[4/3]` grid cell. Uploading cells show `Spinner` and the
truncated filename. Error cells use destructive border/text tokens, expose the error message, and
retain a 44px `Bỏ qua` button.

- [ ] **Step 5: Add responsive layout and concise metadata**

Use this grid contract:

```tsx
<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
  {/* images, pending cells, upload trigger */}
</div>
```

Below it, replace the long helper copy with:

```tsx
<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
  <span className="font-medium text-foreground">
    {urls.length}/{maxFiles} ảnh
  </span>
  {reorderable && urls.length > 1 ? (
    <span>Kéo tay nắm để sắp xếp.</span>
  ) : null}
</p>
```

When `maxFiles` is undefined, render `{urls.length} ảnh` rather than an undefined maximum.

- [ ] **Step 6: Preserve the sortable and input boundaries**

Wrap only the completed/pending/upload grid in the existing per-gallery `SortableCollection`.
Pending cells and the upload tile must not be `SortableItem`s. Keep the hidden file input disabled
when `disabled`, `uploading`, or `atLimit`.

- [ ] **Step 7: Run UI package checks**

Run:

```bash
pnpm --filter=@booking/ui lint
pnpm --filter=@booking/ui typecheck
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 8: Review the isolated diff**

Run:

```bash
git diff -- packages/ui/src/components/form/image-upload.tsx
```

Confirm the default, document, and listing-level gallery branches are unchanged except for the
variant type extension.

---

### Task 2: Select the compact gallery from package editing

**Files:**

- Modify: `apps/dashboard/app/features/partner/components/package-editor.tsx`

**Interfaces:**

- Consumes: `ImageUpload` with `variant="compact-gallery"`.
- Preserves: `PackageRow.photos`, `update(index, patch)`, maximum eight images, listing upload target,
  package reorder provider, and `sortOrder` generation outside this component.

- [ ] **Step 1: Opt package images into the new variant**

Add the variant without changing any controlled value logic:

```tsx
<ImageUpload
  value={row.photos}
  onChange={(photos) =>
    update(index, {
      photos: Array.isArray(photos) ? photos : [photos].filter(Boolean),
    })
  }
  target="listings"
  multiple
  maxFiles={8}
  reorderable
  variant="compact-gallery"
/>
```

- [ ] **Step 2: Remove duplicate helper text**

Delete the `Tối đa 8 ảnh...` paragraph under `ImageUpload`; the compact gallery now owns count,
cover, and reorder guidance. Keep the field label `Hình ảnh gói`.

- [ ] **Step 3: Run dashboard checks**

Run:

```bash
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Review the isolated diff**

Run:

```bash
git diff -- apps/dashboard/app/features/partner/components/package-editor.tsx
```

Confirm package fields, active state, delete behavior, package sorting, and `photos` normalization
are unchanged.

---

### Task 3: Verify behavior and production integration

**Files:**

- Verify: `packages/ui/src/components/form/image-upload.tsx`
- Verify: `apps/dashboard/app/features/partner/components/package-editor.tsx`

**Interfaces:**

- Consumes: completed Task 1 and Task 2 behavior.
- Produces: a verified create/edit package gallery at desktop and mobile widths.

- [ ] **Step 1: Run project policy and structure guards**

Run:

```bash
pnpm check:no-tests
pnpm check:frontend-structure
```

Expected: both guards exit 0.

- [ ] **Step 2: Run the production dashboard build**

Run:

```bash
pnpm --filter=@booking/dashboard build
```

Expected: client and SSR builds exit 0. Existing source-map reporting warnings may remain.

- [ ] **Step 3: Verify desktop package editing**

Open an edit route containing at least one fixed-price package and confirm:

- thumbnails form a consistent responsive grid;
- the cover badge is readable without covering the subject;
- actions reveal on hover and remain reachable by keyboard focus;
- the upload trigger matches the image tile geometry;
- keyboard and pointer reorder update the cover badge;
- viewing and deleting images do not reorder the package card;
- no horizontal overflow appears.

- [ ] **Step 4: Verify mobile package editing**

At a 390px to 520px viewport, confirm:

- the grid uses two columns;
- view, delete, and drag controls remain visible and at least 44px;
- filenames and errors do not overflow;
- touch sorting works from the grip;
- the gallery does not interfere with package sorting or page scrolling.

- [ ] **Step 5: Verify unchanged consumers**

Open a listing with the main listing gallery and one form using the default uploader. Confirm their
layout and interactions are unchanged.

- [ ] **Step 6: Final diff and status review**

Run:

```bash
git diff --check
git status --short
```

Confirm only the approved compact-gallery implementation is new relative to the existing dirty
worktree, and do not stage or discard unrelated user changes.
