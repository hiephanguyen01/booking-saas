# Plan — PR #11c: ListingGroup + cascade qua `ListingGroup` aggregate

> PR con cuối (3/3) của module listing → **hoàn tất module**. Branch: `refactor/entity-listing-group`
> (cắt từ `refactor/entity-centric` sau khi #11b merge). Kế tiếp module: scheduling (#12).

## Nguyên tắc (kế thừa toàn bộ — xem HANDOFF §4, giống #11a/#11b)
Behavior-preserving 100%: mã lỗi + status + **message từng ký tự** + envelope; outbox eventType +
payload + thứ tự emit; schema đóng băng; read-side đóng băng; **CAS ở lại repo** (moderate/update
`WHERE id=…`, KHÔNG thêm); entity framework-free, clock tham số; money chuỗi số ở mapper.

## ⚠️ Quyết định phạm vi (FROZEN)
1. **KHÔNG đụng bộ máy transition dùng chung** (`domain/moderation/listing-moderation.ts`:
   `transitionSubmit/Publish/Hide/Republish`, `ModerationError`; `application/moderation/
   moderation-support.ts`: `runModeration`, `groupNotFound`, `assertOwnership`,
   `stampModerationTimestamps`, `writeModerationAudit`). #11b đã để nguyên; #11c cũng vậy.
2. **`run-group-moderation.ts` + `build-listing-group-review.ts` LÀ group-specific** (chỉ group dùng)
   → #11c ĐƯỢC sửa, nhưng **giữ nguyên hình dạng cascade** (xem §Cascade). `ListingGroup` aggregate
   nuốt content invariant + access guard; **cascade loop + single audit + single outbox ở lại
   application layer** (cần `IListingRepository` + tx — entity không đụng port/tx).
3. `ListingGroup` entity KHÔNG tái hiện transition; KHÔNG chứa cascade loop.

## Bảng mã lỗi đóng băng (byte-exact — nguồn: survey #11c). Mọi body đã có statusCode.

### Nhóm A — group content invariants → DomainError (đặt `listing-group-errors.ts`, extend)
| Code | Status | Message (nguyên văn) | Site | Class |
|---|---|---|---|---|
| `LISTING_TYPE_NOT_FOUND` | 404 | `Listing type not found` | create | **reuse** shared `ListingTypeNotFound` |
| `LISTING_TYPE_NOT_GROUPABLE` | 400 | `This listing type only supports standalone listings` | create | **NEW** `ListingTypeNotGroupable` |
| `LISTING_GROUP_SLUG_TAKEN` | 409 | `Slug "${slug}" is already in use` | create, update | **NEW** `ListingGroupSlugTaken(slug)` |
| `LISTING_GROUP_NOT_FOUND` | 404 | `Listing group not found` | update, delete | **reuse** `ListingGroupNotFound` (#11b) |
| `LISTING_GROUP_NOT_OWNED` | 403 | `Listing group belongs to another partner` (KHÔNG "The") | update, delete (requirePartnerId) | **NEW** `ListingGroupNotOwnedForManage` — ⚠️ KHÁC `ListingGroupNotOwned` của #11b ('The listing group…') |
| `LISTING_GROUP_READ_ONLY` | 409 | `Hide the listing group before editing it` | update (requirePartnerId, status∉{draft,archived}) | **NEW** `ListingGroupReadOnlyForOwnEdit` — ⚠️ message THỨ BA, khác ForEdit/ForDelete của #11b (kia là gate bind child listing) |
| `LISTING_GROUP_NOT_EMPTY` | 409 | `Cannot delete a group with ${count} listing(s)` | delete | **NEW** `ListingGroupNotEmpty(count)` |
| `LISTING_GROUP_EMPTY` | 400 | `Add at least one listing before submitting the group` | submit cascade (`run-group-moderation`) | **NEW** `ListingGroupEmpty` |

### Nhóm B — giữ nguyên INLINE (orchestration cross-module, KHÔNG chuyển DomainError)
`INVALID_ADMINISTRATIVE_DIVISION` (2 message, giống #11b để inline), moderation transition error
(`LISTING_ALREADY_PUBLISHED`/`LISTING_NOT_IN_REVIEW`/`LISTING_NOT_ARCHIVED`/`LISTING_ADMIN_LOCKED` qua
`runModeration`/`ModerationError` shared), `NOT_OWNED` của cascade (`assertOwnership` shared — giữ),
`LISTING_HAS_CONTACT_INFO` (400, publish-group gate — giữ inline), `groupNotFound()` shared helper
(cascade 404 — giữ). `LISTING_TYPE_NOT_FOUND` create: reuse shared class (byte-match).

## Cascade — ĐÓNG BĂNG từng chi tiết (`run-group-moderation.ts`)
1 `forTenant` tx, thứ tự: `groups.findById`→`groupNotFound()` nếu null; `assertOwnership(group,
ctx.partnerId)`; `children = listings.list(tx, {groupId, partnerId: group.partnerId})` (snapshot);
**empty-guard chỉ submit**: `children.length===0` → `LISTING_GROUP_EMPTY`; `outcome =
transition(group, children)` (group tự transition, publish có contact-gate ở đây); `groups.moderate(tx,
id, outcome)` (chỉ status/publishedBy/hiddenBy — repo bỏ qua submittedAt/publishedAt vì group không có
cột đó); **child loop** (mỗi child: transition tương ứng + `stampModerationTimestamps` + `moderate` —
KHÔNG per-child outbox, KHÔNG per-child audit; publish child actor hardcode `'admin'`; hide/republish
child actor = `actorFromOutcome(outcome)` = group's hiddenBy/publishedBy); **1 audit row** (group,
`action='listing_group.${action}'`, fromStatus=group.status cũ); **1 outbox** (`eventType`, payload
`{groupId: id}`).

**Reopen cascade** (update-listing-group, partner + status='archived'): direct-write
`{status:'draft', publishedBy:null, hiddenBy:null}` cho group + mọi child (`Promise.all`), emit
`listing_group.reopened` payload `{listingGroupId}`, **KHÔNG audit**, **bypass transition machine**
(kể cả admin-lock) — GIỮ NGUYÊN.

Publish-group audit reason: `force ? 'force-published: contact-info gate bypassed' : undefined`
(ghi bất kể có flag hay không — KHÁC publish-listing chỉ ghi khi thực sự override). Giữ nguyên.

## Outbox (giữ eventType + payload + key)
create=`listing_group.created {listingGroupId}`, update=`listing_group.updated {listingGroupId}`,
reopen=`listing_group.reopened {listingGroupId}`, delete=`listing_group.deleted {listingGroupId}`,
submit=`listing_group.submitted {groupId}`, publish+republish=`listing_group.published {groupId}`,
hide=`listing_group.hidden {groupId}`. **Key split `listingGroupId` (CRUD) vs `groupId` (moderation)
GIỮ NGUYÊN** (0 consumer; đừng normalize — sẽ là wire change). 0 per-child event.

## Bề mặt cross-module
`grep IListingGroupRepository` ngoài module = 0. `listing_group.*` event = 0 consumer. Port group tự
do đổi nội bộ, NHƯNG giữ read method (`findById/findBySlug/list/listPage/countListings`) ổn định vì
read use-case + write use-case đều gọi. `create-listing-group` inject `ResolveAdministrativeAddressUseCase`
+ `LISTING_TYPE_REPOSITORY` (catalog) trực tiếp — pre-existing, giữ.

## Known gap PHẢI GIỮ (thêm §8a Task 5)
1. `LISTING_GROUP_NOT_OWNED` giờ 1-code/2-message (child-binding 'The listing group…' của #11b vs
   group-own 'Listing group…' của #11c) — 2 class riêng.
2. `LISTING_GROUP_READ_ONLY` giờ 1-code/3-message (#11b 'changing its items'/'deleting its items' +
   #11c 'editing it') — 3 class.
3. Cascade: **1 audit + 1 outbox cho group**, 0 per-child (sửa nhầm survey.md:987 nói N audit).
4. Group-cascade publish/hide **KHÔNG fan-out `listing.published`/`listing.hidden`** → child
   group-managed không gửi email/không trigger scheduling. Pre-existing, giữ.
5. Reopen cascade **không audit** + payload key `listingGroupId` (khác `groupId` của moderation).
6. Reopen cascade **bypass transition machine** (ghi thẳng draft, bỏ qua admin-lock).
7. Group **delete không status-gate** (any-status, 0-child là xoá được).
8. Tenant-scoped update **được reassign `partnerId`/`listingTypeId`** (partner-scoped thì force undefined).

## Tasks

### Task 1 — Domain errors (extend `listing-group-errors.ts`)
Mint: `ListingTypeNotGroupable`, `ListingGroupSlugTaken(slug)`, `ListingGroupNotEmpty(count)`,
`ListingGroupEmpty`, `ListingGroupNotOwnedForManage` (msg 'Listing group belongs to another partner'),
`ListingGroupReadOnlyForOwnEdit` (msg 'Hide the listing group before editing it'). JSDoc rõ 2 NotOwned
+ 3 ReadOnly "NOT interchangeable". Reuse shared `ListingTypeNotFound`, `ListingGroupNotFound` (#11b).
Verify byte-exact với survey. typecheck+lint. Commit `feat(listing): domain errors cho ListingGroup`.

### Task 2 — `ListingGroup` aggregate (`domain/entities/listing-group.entity.ts`)
Narrow write-state `{ partnerId, status }` (ownership đọc partnerId; read-only-gate đọc status). `static
rehydrate`. `assertOwnedForManage(partnerId?)` → `ListingGroupNotOwnedForManage` (dùng cho cả update +
delete — cùng message). `assertEditableStatus()` → `ListingGroupReadOnlyForOwnEdit` khi status∉
{draft,archived} (chỉ gọi ở partner-path update). `static assertGroupableType(structure)` →
`ListingTypeNotGroupable` khi `structure==='standalone'`. `static open(input): NewListingGroup` (map →
CreateListingGroupData). `applyContentUpdate(patch): ListingGroupContentPatch` (map → UpdateListingGroupData;
partnerId/listingTypeId forcing để ở use-case). Structurally-assignable ports. KHÔNG cascade, KHÔNG
transition, KHÔNG getter thừa. typecheck+lint. Commit `feat(listing): ListingGroup aggregate`.

### Task 3 — Wire content (create/update/delete-listing-group)
- **create**: giữ inline admin-div + listingType lookup (`ListingTypeNotFound` shared) ; route
  `Listing­Group.assertGroupableType(type.structure)`, slug-conflict → `ListingGroupSlugTaken`,
  `groups.create` qua `ListingGroup.open`. Emit `listing_group.created {listingGroupId}`.
- **update**: giữ admin-div precondition + slug. Route `assertOwnedForManage(requirePartnerId)` +
  `assertEditableStatus()` (chỉ partner-path, đúng gate hiện tại). **Reopen cascade GIỮ NGUYÊN** (direct
  write + Promise.all children + `listing_group.reopened` + no audit). `groups.update` qua
  `applyContentUpdate` (giữ partnerId/listingTypeId force-undefined khi partner-scoped, pass-through khi
  tenant). Emit `listing_group.updated`.
- **delete**: `assertOwnedForManage(requirePartnerId)`; `countListings` + `ListingGroupNotEmpty(count)`;
  KHÔNG status-gate (giữ). Emit `listing_group.deleted`.
- Retype port create/update; bỏ type cũ nếu 0 consumer (grep). typecheck+lint+build. Commit
  `refactor(listing): create/update/delete-listing-group qua aggregate`.

### Task 4 — Wire moderation cascade (submit/review/publish/republish/hide + run-group-moderation)
- Giữ NGUYÊN `runGroupModeration` cascade shape (transition machine + child loop + 1 audit + 1 outbox).
- Chỉ chuyển: `LISTING_GROUP_EMPTY` inline → `new ListingGroupEmpty()` (byte-identical). Ownership
  cascade (`assertOwnership` shared) GIỮ (hoặc route qua `ListingGroup.assertOwnedForManage`? — KHÔNG,
  vì assertOwnership ném `NOT_OWNED`/'This resource…' khác message với assertOwnedForManage; GIỮ shared
  `assertOwnership`). publish-group contact-gate + force-reason asymmetry GIỮ. review-group read-only:
  giữ nguyên.
- Nếu Task 4 gần như không đổi (chỉ LISTING_GROUP_EMPTY) → chấp nhận; cascade là orchestration
  application-layer, aggregate không nuốt. typecheck+lint+build. Commit
  `refactor(listing): listing-group moderation — ListingGroupEmpty qua domain error`.

### Task 5 — Docs + verify + smoke + PR + merge
- spec §8a: thêm 8 known gap trên; sửa survey.md:987 (1 audit không phải N). HANDOFF: 11c ✅ →
  **module listing XONG**, kế tiếp #12 scheduling.
- `pnpm turbo lint typecheck build` + check:rls xanh. Final review (fable).
- Smoke (PORT=3001): create→submit→publish(+force)→hide→republish cho group (partner+tenant); reopen
  (archived→draft partner update); delete empty vs non-empty; cascade — psql xác nhận **child status
  đổi theo group** + **chỉ 1 audit + 1 outbox {groupId}** + reopen `{listingGroupId}` no-audit; 2
  NotOwned message + 3 ReadOnly message phân biệt; groupable guard.
- PR `--base refactor/entity-centric`, merge (owner cho phép). Báo: **module listing hoàn tất 3/3**.
