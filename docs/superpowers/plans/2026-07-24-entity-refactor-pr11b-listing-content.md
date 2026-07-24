# Plan — PR #11b: Listing content + moderation qua `Listing` aggregate

> PR con thứ 2/3 của module listing (sau #11a ancillary). Branch: `refactor/entity-listing-content`
> (cắt từ `refactor/entity-centric` sau khi #11a/PR #29 merge). Base commit: HEAD của
> `refactor/entity-centric` sau merge #29 (`7f30c60`). Kế tiếp: **#11c** ListingGroup + cascade.

## Nguyên tắc (kế thừa toàn bộ luật refactor — xem HANDOFF §4)

Behavior-preserving 100%: mã lỗi + status + **message từng ký tự** + envelope; outbox eventType +
payload + thứ tự emit; schema đóng băng; read-side đóng băng; **CAS ở lại repository** (moderate/update
hiện là `WHERE id=…` không CAS — GIỮ NGUYÊN, không thêm version/status-guard); entity framework-free,
clock là **tham số** (moderation dùng app-clock `new Date()` — truyền vào, không đọc trong entity);
money `bigint`/chuỗi số chỉ ở mapper/repo.

## ⚠️ Quyết định phạm vi (FROZEN — đọc trước khi code)

1. **KHÔNG đụng bộ máy moderation dùng chung** — nó chia sẻ với #11c:
   - `domain/moderation/listing-moderation.ts` (`transitionSubmit/Publish/Hide/Republish`,
     `ModerationError`, `ModerationOutcome`, `assertNotAdminLocked`).
   - `application/moderation/moderation-support.ts` (`runModeration`, `ModerationContext`,
     `listingNotFound`, `groupNotFound`, `stampModerationTimestamps`, `writeModerationAudit`,
     `assertOwnership`).
   - `application/moderation/run-group-moderation.ts`, `build-listing-review.ts`,
     `build-listing-group-review.ts`.
   Bộ máy transition **đã là pure domain function** (thoả §3 "sanctioned alternative"), nên hợp lệ để
   nguyên. `Listing` aggregate **gọi** `transition*` + `stampModerationTimestamps` qua use-case, KHÔNG
   tái hiện lại chúng. Việc hợp nhất `ModerationError`→`DomainError` để riêng một PR sau (ghi §8b
   follow-up) khi cả listing + group đã refactor xong.
2. **KHÔNG đụng bất kỳ `*-listing-group*` use-case** (đó là #11c).
3. **KHÔNG đụng** `domain/pricing/package-config.ts` / `quote-calculator.ts` (booking + scheduling
   plain-import; frozen cross-module).
4. Aggregate **chỉ nuốt invariant thật của Listing**: quyền sở hữu (edit/delete), bookingModes⊆allowed,
   ràng buộc group-binding, slug-conflict (phát biểu), has-bookings, group-managed guard cho moderation.
   **KHÔNG chuyển các validation orchestration cross-module thành DomainError** (partner tồn tại,
   listing-type tồn tại, admin-division, deposit-coverage, attribute schema, mode-config) — chúng là
   việc điều phối của use-case, giữ **nguyên văn** `HttpException`/hàm cross-module hiện tại (0 rủi ro).

## Bảng mã lỗi đóng băng (byte-identical — nguồn: survey #11b)

Tất cả body **đều đã có `statusCode`** (khác #11a: ở đây không có envelope-normalization nào — mọi
throw hiện tại là `HttpException` với object literal chứa `statusCode`, hoặc `DomainError` được filter
thêm `statusCode`). Không có wire change nào trong #11b.

### Nhóm A — Listing invariants (chuyển lên aggregate → DomainError)
| Code | Status | Message (nguyên văn) | Site | Class |
|---|---|---|---|---|
| `LISTING_NOT_FOUND` | 404 | `Listing not found` | update, delete, 5 moderation | **reuse** `ListingNotFound` (#11a) |
| `LISTING_NOT_OWNED` | 403 | `This listing belongs to another partner` | update (opts.requirePartnerId) | **reuse** `ListingNotOwned` (#11a) |
| `LISTING_NOT_OWNED` | 403 | `Listing belongs to another partner` (KHÔNG "This") | delete (options.requirePartnerId) | **NEW** `ListingNotOwnedForDelete` — same code, doc "NOT interchangeable" |
| `NOT_OWNED` | 403 | `This resource belongs to another partner` | submit, hide, republish (via `assertOwnership`) | **NEW** `ListingNotOwnedForModeration` (code `NOT_OWNED`) — doc rõ code khác 2 class trên |
| `INVALID_BOOKING_MODES` | 400 | `Modes not allowed by the listing type: ${invalidModes.join(', ')}` | create, update | **NEW** `InvalidBookingModes(invalidModes)` |
| `LISTING_SLUG_TAKEN` | 409 | `Slug "${slug}" is already in use` | create, update | **NEW** `ListingSlugTaken(slug)` |
| `LISTING_HAS_BOOKINGS` | 409 | `Cannot delete a listing with ${n} booking(s)` | delete | **NEW** `ListingHasBookings(count)` |
| `GROUP_MANAGED_LISTING` | 400 | 4 message khác nhau (xem dưới) | submit/publish/republish/hide | **NEW** `GroupManagedListing(action)` — message theo action |

`GROUP_MANAGED_LISTING` message theo action: submit=`Submit the parent listing group instead`,
publish=`Publish the parent listing group instead`, republish=`Republish the parent listing group instead`,
hide=`Hide the parent listing group instead`.

### Nhóm B — group-binding (thrown BỞI listing use-case khi bind vào group) → DomainError, đặt `listing-group-errors.ts` (dùng lại ở #11c)
| Code | Status | Message | Site |
|---|---|---|---|
| `LISTING_GROUP_NOT_FOUND` | 404 | `Listing group not found` | create, update |
| `LISTING_GROUP_NOT_OWNED` | 403 | `The listing group belongs to another partner` | create, update |
| `LISTING_GROUP_TYPE_MISMATCH` | 400 | `The listing and its group must use the same listing type` | create, update |
| `LISTING_GROUP_READ_ONLY` | 409 | `Hide the listing group before changing its items` | create, update | → `ListingGroupReadOnlyForEdit` |
| `LISTING_GROUP_READ_ONLY` | 409 | `Hide the listing group before deleting its items` | delete (partner path) | → `ListingGroupReadOnlyForDelete` — same code, doc NOT interchangeable |

> `RESOURCE_NOT_FOUND`/`RESOURCE_NOT_OWNED` (create resolve-resource path) — dùng lại class từ Resource
> #11a nếu message khớp; nếu chưa có, mint trong `listing-errors.ts`. Message: `Resource not found`,
> `The resource belongs to another partner`. (Xác minh #11a đã export chưa; nếu chưa thì tạo mới.)

### Nhóm C — orchestration validations (GIỮ NGUYÊN inline, KHÔNG chuyển DomainError)
`INVALID_ADMINISTRATIVE_DIVISION` (2 message, 1 code), `LISTING_TYPE_NOT_FOUND` (reuse shared
`ListingTypeNotFound` chỉ nếu đang inline khớp — hoặc giữ inline), `INVALID_ATTRIBUTES`,
`INVALID_MODE_CONFIG`/`MODE_UNSUPPORTED`/`MISSING_MODE_CONFIG`/`INVALID_FIXED_PACKAGE_MODES`/
`PACKAGE_CONFIG_REQUIRED`/`FLEXIBLE_PRICE_CONFIG_REQUIRED`/`PACKAGE_CONFIG_NOT_ALLOWED`/
`DUPLICATE_PACKAGE_ID` (từ `package-config.ts` — re-wrap giữ nguyên), `PARTNER_NOT_FOUND`,
`PARTNER_NOT_VERIFIED` (partner module `DomainError`, cross-module — giữ nguyên gọi
`assertCanServeListingType`), `DEPOSIT_BELOW_TENANT_COMMISSION` (giữ nguyên gọi `assertDepositCoverage`).
Các moderation transition error (`LISTING_ALREADY_PUBLISHED`/`LISTING_NOT_IN_REVIEW`/
`LISTING_NOT_ARCHIVED`/`LISTING_ADMIN_LOCKED`) → GIỮ NGUYÊN qua `runModeration`/`ModerationError`
(shared, #11c chưa refactor).

## Bề mặt cross-module đóng băng
`IListingRepository.findById`, `.findPublicBySlug` + shape `ListingRecord`/`PublicListingRecord`
(booking `create-booking`/`mark-returned`, scheduling `get-availability` đọc). `IResourceRepository.findById`,
`IPricingRuleRepository.listByListing` (đã đóng băng #11a) — KHÔNG đụng. Outbox `listing.updated`
(scheduling cache invalidate — payload `{listingId}`), `listing.published`/`listing.hidden`
(notification `DispatchListingEventUseCase` — payload `{listingId}` / `{listingId, hiddenBy}`) — GIỮ shape.

Write candidate để retype: `create` (→ `NewListing`), `update` (→ `ListingContentPatch`). GIỮ NGUYÊN
chữ ký `moderate(tx,id,update: ModerationUpdate)`, `delete`, `findBySlug`, `countBookings`, mọi read.

## Known gap PHẢI GIỮ (thêm vào spec §8a ở Task 5)
1. moderate/update KHÔNG CAS (TOCTOU/lost-update; 2 request đồng thời cùng thắng).
2. `transitionHide` không guard status (any→archived, không bao giờ throw).
3. **3 shape "not owned"**: `ListingNotOwned` (update), `ListingNotOwnedForDelete` (delete, khác message),
   `ListingNotOwnedForModeration` (code `NOT_OWNED`, message khác) — giữ cả 3.
4. `GROUP_MANAGED_LISTING` 1 code / 4 message.
5. `LISTING_GROUP_READ_ONLY` 1 code / 2 message; **delete-path guard chỉ chạy khi `requirePartnerId`**
   (tenant delete bỏ qua guard — bất đối xứng vs update).
6. `INVALID_ADMINISTRATIVE_DIVISION` 1 code / 2 message.
7. `resourceId` trong `UpdateListingInput` bị **âm thầm bỏ** (immutable sau create).
8. `assertCanServeListingType` chạy create, KHÔNG chạy update.
9. `publish-listing`: `checklistPassed` **chỉ để audit reason**, KHÔNG chặn publish; chỉ `contactFlags`
   (+ vắng `force`) mới chặn (`LISTING_HAS_CONTACT_INFO`).
10. `stampModerationTimestamps` dùng app-clock `new Date()` (giữ; entity nhận `now` tham số).
11. `listing.hidden` payload bỏ `reason` (dù audit có) — notification đọc `reason` là no-op.
12. create-listing auto-provision resource gọi thẳng `resources.create` (partnerId không check thuộc tenant — same gap #11a).
13. create/update/delete KHÔNG ghi audit (chỉ 5 moderation ghi).
14. `republish` emit `listing.published` (KHÔNG `listing.republished`) — chỉ audit action khác.

## Tasks

### Task 1 — Domain errors
- `listing-errors.ts`: thêm `ListingNotOwnedForDelete`, `ListingNotOwnedForModeration`,
  `InvalidBookingModes`, `ListingSlugTaken`, `ListingHasBookings`, `GroupManagedListing(action)`. Reuse
  `ListingNotFound`/`ListingNotOwned` sẵn có. Nếu `ResourceNotFound`/`ResourceNotOwned` chưa có ở
  #11a → thêm (grep trước).
- `listing-group-errors.ts` (mới): `ListingGroupNotFound`, `ListingGroupNotOwned`,
  `ListingGroupTypeMismatch`, `ListingGroupReadOnlyForEdit`, `ListingGroupReadOnlyForDelete`. Doc rõ 2
  ReadOnly "same code NOT interchangeable". #11c sẽ dùng lại.
- Verify byte-identical từng message với survey. Commit `feat(listing): domain errors cho Listing content + group-binding`.

### Task 2 — `Listing` aggregate (`domain/entities/listing.entity.ts`)
- Narrow write-state (`ListingContentState`): chỉ field các assert/patch cần — `id, partnerId,
  listingTypeId, groupId, slug, status, bookingModes, modeConfig` (đủ cho ownership + group-binding +
  slug + modes + moderation guard). KHÔNG dùng `ListingRecord` fat.
- `static rehydrate(state)`.
- `assertOwnedForEdit(partnerId?)` → `ListingNotOwned` khi `partnerId && this.partnerId !== partnerId`.
- `assertOwnedForDelete(partnerId?)` → `ListingNotOwnedForDelete` (điều kiện y hệt).
- `assertOwnedForModeration(partnerId?)` → `ListingNotOwnedForModeration` (điều kiện `partnerId &&
  this.partnerId !== partnerId`, tái hiện `assertOwnership`).
- `assertBookingModesAllowed(allowedModes)` → `InvalidBookingModes(invalid)` khi có mode ⊄ allowed
  (tái hiện `bookingModes.filter(m => !allowedModes.includes(m))`).
- `assertNotGroupManaged(action)` → `GroupManagedListing(action)` khi `this.groupId != null`.
- `static open(input): NewListing` — DTO insert cho create (thuần map, KHÔNG kiểm cross-module).
- `applyContentUpdate(patch): ListingContentPatch` — map patch → repo data, **loại `resourceId`**
  (immutable), preserve `undefined`-means-keep.
- KHÔNG có method moderation transition (giữ ở shared machine). KHÔNG getter thừa.
- `NewListing`/`ListingContentPatch` structurally-assignable với `CreateListingData`/`UpdateListingData`.
- Verify typecheck+lint. Commit `feat(listing): Listing aggregate (content invariants + access guards)`.

### Task 3 — Wire content use-cases (create/update/delete)
- **create-listing**: giữ NGUYÊN mọi orchestration inline (admin-div, slug-conflict qua `findBySlug` →
  `ListingSlugTaken`, listingType lookup, `assertValidAttributes`, mode-config, partner lookup +
  `assertCanServeListingType`, deposit-coverage, group-binding, resource resolve/auto-provision). Chuyển
  qua entity: `assertBookingModesAllowed`, group-binding checks (`ListingGroupNotFound/NotOwned/
  TypeMismatch/ReadOnlyForEdit`), slug-conflict (`ListingSlugTaken`). `listings.create` qua
  `Listing.open({...})`. Giữ emit `listing.created` `{listingId}`.
- **update-listing**: giữ NGUYÊN admin-div precondition (2 message), deposit re-check, mode-config,
  slug-conflict → `ListingSlugTaken`. Chuyển qua entity: `assertOwnedForEdit(opts?.requirePartnerId)`,
  group-binding (`ListingGroupNotFound`, `ListingGroupReadOnlyForEdit`, `ListingGroupNotOwned`,
  `ListingGroupTypeMismatch`), `assertBookingModesAllowed`. `listings.update` qua `applyContentUpdate`
  (bỏ `resourceId`). Giữ emit `listing.updated`.
- **delete-listing**: `assertOwnedForDelete(options.requirePartnerId)`; group-read-only **chỉ khi
  requirePartnerId** → `ListingGroupReadOnlyForDelete`; has-bookings qua `countBookings` +
  `ListingHasBookings(n)`. Giữ emit `listing.deleted`.
- Retype port `create`/`update`; bỏ chữ ký cũ nếu 0 consumer (grep). Verify typecheck+lint+build.
  Commit `refactor(listing): create/update/delete-listing qua aggregate`.

### Task 4 — Wire moderation use-cases (submit/review/publish/republish/hide)
- Mỗi use-case: `listings.findById` → `listingNotFound()` (GIỮ helper), rehydrate `Listing`, gọi
  `listing.assertOwnedForModeration(ctx.partnerId)` thay `assertOwnership(...)` (chỉ submit/hide/
  republish), `listing.assertNotGroupManaged('submit'|'publish'|'republish'|'hide')` thay
  `if(listing.groupId) throw GROUP_MANAGED_LISTING`. **GIỮ NGUYÊN**: `runModeration(() =>
  transition*(...))`, `stampModerationTimestamps(record, outcome, new Date())` (hide: không stamp),
  `listings.moderate`, `writeModerationAudit`, emit (submit=`listing.submitted`, publish/republish=
  `listing.published`, hide=`listing.hidden` `{listingId, hiddenBy}`).
- **publish-listing**: giữ NGUYÊN `buildListingReview` + `contactFlags`/`force` gate
  (`LISTING_HAS_CONTACT_INFO`) + audit `overrode` reason. **review-listing**: read-only, chỉ đổi nếu
  cần (thực ra không có invariant Listing để chuyển — có thể GIỮ NGUYÊN, chỉ dùng `listingNotFound()`).
- Verify typecheck+lint+build. Commit `refactor(listing): listing moderation qua aggregate access-guards`.

### Task 5 — Docs + verify + smoke + PR
- spec §8a: thêm 14 known gap nhóm trên (đặc biệt: no-CAS moderate, hide any→any, 3 not-owned shape,
  delete group-guard chỉ partner-path, resourceId dropped, checklist non-blocking). Ghi rõ quyết định
  "moderation machine giữ shared/pure, chưa fold vào entity — để PR hợp nhất sau (§8b follow-up)".
- `apps/api/CLAUDE.md`: (đã có listing trong danh sách; không cần đổi).
- HANDOFF §1: `11b ✅`, kế tiếp `11c`.
- `pnpm turbo lint typecheck build` + `check:rls` xanh.
- Smoke (API PORT=3001, seed StudioHub/giang; tự tạo draft + dọn): create→submit→publish→hide→
  republish→update→delete happy path; + illegal transition (publish khi chưa pending_review →
  `LISTING_NOT_IN_REVIEW`), ownership fail (partner khác → `NOT_OWNED`; delete partner khác →
  `LISTING_NOT_OWNED` message KHÔNG "This"), group-managed (submit listing có groupId →
  `GROUP_MANAGED_LISTING` message đúng action), slug-taken, has-bookings, admin-lock. psql xác nhận
  status transition + outbox eventType/payload. Cross-module regression: booking đọc `findById` OK.
- Final review toàn nhánh (fable). PR `--base refactor/entity-centric`. Merge (owner đã cho phép
  merge tự động). Báo controller ngắn gọn, tiếp #11c.
