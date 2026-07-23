# Design: Entity-centric refactor toàn bộ `apps/api` (Rich DDD aggregate)

**Ngày:** 2026-07-23 · **Trạng thái:** Đã duyệt hướng, chờ implementation plan từng module
**Phụ lục khảo sát chi tiết (bắt buộc đọc khi plan từng module):** [`docs/refactor/entity-centric-survey.md`](../../refactor/entity-centric-survey.md)

## 1. Bối cảnh & mục tiêu

API hiện là hexagonal đúng hướng phụ thuộc (ADR 0006: `controller → use-case → repository-port →
repository`, không service class) nhưng **không có tầng entity**: `domain/` của cả 16 module chỉ chứa
pure functions rời rạc + ports. State và behavior tách đôi — use-case load anemic record từ port, tự
ráp từng mảnh rule. Invariant bị phân mảnh 4 nơi: pure function trong `domain/`, inline trong
use-case, where-clause trong repository, và DB constraint. Với 258 use-cases, mỗi flow mới phải "nhớ"
lắp đúng mọi mảnh — đây là nguồn bug chính.

**Mục tiêu:** business core dời về `domain/entities/` — mỗi aggregate sở hữu state + invariant của
nó; use-case teo lại thành orchestration thuần (load → gọi method → persist → emit). Refactor là
**behavior-preserving 100%**: không đổi API surface, không đổi schema, không siết invariant nào đang
lỏng (ghi sổ, siết sau).

## 2. Quyết định đã chốt (owner, 2026-07-23)

1. **Phương án A — Rich aggregate toàn bộ**: mọi module có state đều có `domain/entities/`; kể cả
   module mỏng (favorites) cũng có entity mỏng. Ngoại lệ duy nhất: `administrative-division` là
   catalog seed bất biến → value object + factory, không có aggregate (không có lifecycle để mô hình).
2. **Merge strategy**: nhánh tích hợp dài `refactor/entity-centric`; **mỗi module = 1 branch + 1 PR
   merge vào nhánh tích hợp** (không vào `main`). Nhánh tích hợp sync `main` vào định kỳ; merge về
   `main` một lần khi xong (hoặc theo mốc owner quyết sau).
3. **Behavior gaps: giữ nguyên + ghi sổ.** Mọi invariant phát-hiện-nhưng-chưa-enforce được ghi vào
   Known-gap register (§8), KHÔNG sửa trong refactor. Siết lại = các PR follow-up riêng sau khi
   refactor xong.
4. **Schema-frozen.** Toàn bộ refactor không đụng `schema.prisma`/migrations; `check:rls` không đổi.
   Các unique backstop còn thiếu (§8b) dồn thành 1 wave migration riêng sau refactor.
5. **Finance đủ 5 aggregate, trong đó 2 cái mỏng**: Settlement/Payout/SettlementDispute đầy đủ;
   CommissionRule + LedgerJournal chỉ formalize mỏng (ledger-journal.ts đã là pure builder, DB
   trigger đã enforce balance — vùng no-touch SQL giữ nguyên tuyệt đối).
6. **Tuần tự nghiêm**: 16 PR làm lần lượt đúng thứ tự §6, không song song.
7. **ADR 0005 (no tests) + ADR 0006 (no services) giữ nguyên.** Xác minh mỗi PR theo §9.
8. **3 module "không aggregate-shaped" vẫn convert đầy đủ.** Phiên 2026-07-20 từng thử và kết luận
   promotions / payments (Payment, Refund) / scheduling không đáng convert (pure-domain sạch +
   atomic WHERE-guarded SQL — bọc entity kiểu load-check-save sẽ regress atomicity). Owner
   2026-07-23 quyết định convert đầy đủ cả 3, với điều kiện tiên quyết là luật **CAS ở lại repo**
   (§3) — entity chỉ đứng trước guarded SQL, không bao giờ thay thế nó. Reviewer của 3 PR này phải
   soi đúng điểm đó.
9. **Domain error → HTTP qua global exception filter** (chốt từ 2026-07-20, đã chạy thật): shared
   kernel `src/shared/domain/domain-error.ts` (abstract `DomainError`: `code` + `httpStatus` +
   `details`) + `domain-exception.filter.ts` (`@Catch(DomainError)` → đúng envelope
   `{ statusCode, code, message, details? }` hiện tại), wire `APP_FILTER` trong `app.module.ts` ở
   PR pilot. Use-case không try/catch dịch lỗi; entity throw typed error là đủ.
   `apps/api/CLAUDE.md` đang ghi "không có global exception filter" — cập nhật trong PR pilot.

## 3. Style chuẩn cho aggregate (áp dụng mọi module)

Layout mỗi module sau refactor:

```
domain/
  entities/<aggregate>.ts      # class framework-free (không Nest/Prisma/zod import)
  value-objects/…              # khi có VO đáng tách
  errors/…                     # typed DomainError của module (mã dùng chung → shared/domain/errors/)
  ports/…                      # tách write/read port KHI port fat; port gọn giữ hợp nhất (§3 gate)
application/
  use-cases/…                  # orchestration thuần, 1 file 1 use-case (ADR 0006)
  <module>.mapper.ts           # serialize (bigint→string ở đây, không ở entity)
infrastructure/
  repositories/…               # map row ⇄ write-state, dịch DB violation (P2002, 23P01…)
  http/…                       # không đổi
```

Quy tắc entity:

- **Class framework-free**: private constructor; `static rehydrate(state)` cho row có sẵn;
  `static create/open(...)` cho record mới (validate creation invariant; được phép trả `New<X>` DTO
  thay vì entity khi id do DB cấp lúc insert — ratified 2026-07-23); method mang invariant.
- **Write-state hẹp**: `<Aggregate>State` chỉ chứa cột entity sở hữu (status, snapshot đông cứng,
  tiền `bigint`, field legacy giữ nullable). Fat read record (join, display field, rollup) **không
  bao giờ** vào entity — ở lại read-port + mapper.
- **Rehydrate khoan dung, create nghiêm ngặt**: validation chặt chỉ ở create; rehydrate chấp nhận
  mọi thứ DB đang chứa (jsonb legacy, snapshot nullable, giá number từ seed) — row lịch sử không
  bao giờ làm crash.
- **Hai kiểu transition**, khớp ngữ nghĩa từng path hiện tại:
  - *HTTP-driven*: được throw typed domain error (extend `DomainError`, §2.9); global filter dịch ra
    **đúng mã lỗi + status + envelope hiện có, byte-compatible** — use-case không try/catch dịch lỗi.
  - *Outbox/worker-driven*: method trả boolean/result, **no-throw, no-op idempotent** khi redelivery
    (relay at-least-once, KHÔNG có dead-letter — một throw mới sẽ kẹt event vĩnh viễn). Handler nào
    hôm nay *cố ý* throw-để-retry (finance ordering-recovery, tenancy DNS TXT check) **giữ nguyên
    throw**, ghi chú "retryable".
- **CAS ở lại repository (luật quan trọng nhất)**: mọi write đang guard bằng `WHERE status=…`,
  `LEAST/GREATEST`, advisory lock, `updateMany`, unique index, GiST **giữ nguyên hình dạng SQL sau
  port**. Entity phát biểu rule và ý định; repo thực thi guarded write và trả outcome. Không bao giờ
  thay CAS bằng load-check-save. Thao tác set-based (vd `markConfirmedPaid` của affiliate) giữ
  set-based, không biến thành N lần load aggregate.
- **Đồng hồ là tham số**: method nhận `now: Date` do use-case cấp, đúng nguồn hiện tại của từng
  call-site (`tenantDb.databaseNow(tx)` vs `utcNow()`) kể cả chỗ đang lệch nhau — đổi nguồn clock là
  follow-up có chủ đích, không làm ngầm trong refactor. Entity không bao giờ gọi
  `Date.now()`/`new Date()`.
- **Tiền & rate**: entity giữ `bigint` VND + integer percent; chuỗi số chỉ xuất hiện ở mapper và
  outbox payload. `JSON.stringify` không bao giờ thấy entity. Parser dual-shape khoan dung
  (`string|number` trong modeConfig) giữ nguyên.
- **Domain events**: use-case build payload và emit qua `OutboxService.emit(tx,…)` **trong
  cùng forTenant tx** — KHÔNG có `pullDomainEvents()` trên entity (ratified 2026-07-23:
  payload vốn đóng băng theo surface freeze, và create cần id DB cấp sau insert nên entity
  không gom event nhất quán được). eventType, payload shape (bigint là `.toString()`),
  thứ tự emit đóng băng byte-for-byte. Chỗ hiện tại emit mà không transition (booking
  late-webhook auto-refund emit `booking.cancelled` không đổi status) giữ nguyên khả năng
  đó — emission không bị trói vào transition thành công.
- **Pure function cross-module giữ nguyên import path**: `priceQuote`, `computeCommissionSplit`,
  `applyCustomRate`, `assertValidAttributes`, `assertCanServeListingType`, `findActivePackage`… có
  thể thành wrapper mỏng gọi entity/VO, nhưng **không đổi chỗ, không đổi signature** trong refactor.
- **Chỉ refactor write-path**: read/list/search/projection use-case, controller, contracts, response
  shape giữ nguyên. Di dời read-helper (vd fallback-policy resolution) chỉ khi có chủ đích và kết
  quả giống hệt.
- **RLS/pool không đổi**: 1 forTenant tx / business operation, repo nhận `tx`, không nest; các ngoại
  lệ hiện tại (identity-access + tenancy + notification-log trên admin pool; administrative-division
  tx-less) **vẫn là ngoại lệ**, không nhân rộng, không thu hẹp.

### Style-gate đã chốt (2026-07-23, sau PR #1 pilot — áp dụng từ PR #2, pilot đã retrofit)

1. **Port**: tách write/read khi port fat, hợp nhất khi gọn (đã ghi vào Layout ở trên). Khi MỘT
   class Prisma implement cả write port lẫn reader port, bind bằng bộ ba `useExisting` (class là
   provider thường + 2 token alias) để có đúng một singleton — không dùng 2 `useClass` (double
   instantiation). Tiền lệ: `content-reports.module.ts` (PR #2). Và không bao giờ inject class cụ
   thể — chỉ qua port; lint chặn application/domain import infrastructure (eslint.config.mjs).
2. **Domain events**: use-case build payload, không `pullDomainEvents()` (đã ghi ở trên).
3. **Wire error dùng chung → shared kernel**: mã lỗi nhiều module cùng emit (vd `TENANT_NOT_FOUND`)
   định nghĩa MỘT lần ở `src/shared/domain/errors/` (vd `TenantNotFound`), module import — không
   mint per-module.
4. **Template refinements**:
   - Nhánh defensive/unreachable trong repo throw `Error` thường (→ 500 của Nest), KHÔNG tái dùng
     `DomainError` 4xx — bug server không được đội lốt lỗi client.
   - `DomainExceptionFilter` log error trước khi respond nếu `httpStatus ≥ 500` (quy ước:
     `DomainError` là 4xx-only; ≥500 là dấu hiệu dùng sai).
   - Accessor trả pending child trên aggregate đặt tên `pendingXxx()` (vd `pendingReply()`), không
     trùng tên field state đã persist.
   - VO validation-error mirror của zod chỉ là defensive-depth (zod pipe là boundary thật) — ghi rõ
     trong doc comment, không cần khớp từng byte envelope của pipe.

## 4. Luật cross-cutting cho mọi PR

- **Surface freeze**: use-case export cross-module, DI token, port signature/record shape module khác
  inject, outbox eventType + payload + thứ tự emit, mã lỗi HTTP/status/envelope — đóng băng
  byte-for-byte trong PR refactor. Đổi có chủ đích = PR riêng, không trộn.
- **Audit outbox handler trước khi đụng**: liệt kê hành vi throw/no-op hiện tại của từng handler
  trong PR description; không đổi chiều nào (throw→no-op hoặc ngược lại).
- **DB constraint vẫn là trọng tài**: giữ mọi unique + P2002 translation, GiST `23P01`→SlotTaken,
  CHECK, deferred ledger trigger, partial unique, FK RESTRICT. Check trong aggregate là
  **pre-validation cộng thêm cho chất lượng lỗi**, không thay thế.
- **Handler wiring hygiene**: khi PR đụng file đăng ký outbox của module, thay pattern
  `event.tenantId ?? ''` bằng validate-and-skip-with-log (một policy duy nhất toàn app). Đây là
  normalization duy nhất được phép ngoài behavior-preserving (chỉ ảnh hưởng event thiếu tenantId —
  hiện tại crash/undefined behavior).
- **Dead code xóa trong PR của module sở hữu, không hồi sinh** (§8c).
- **Không đụng vùng no-touch SQL**: RLS role/policy migrations, ledger triggers/constraints, GiST
  exclusion (ADR 0004).

## 5. Bản đồ aggregate (~30 aggregate / 16 module)

| # | Module | Aggregates | Effort | Ghi chú chính |
|---|--------|-----------|--------|---------------|
| 1 | reviews | Review (ReviewReply con 0..1, ReviewMedia VO) | S | Pilot. Cần BookingSnapshot port hẹp (không import module booking); P2002 vẫn là enforcer thật của one-review/one-reply |
| 2 | content-reports | ContentReport | S | Máy trạng thái đầu tiên; transition legality là gap → ghi sổ, không siết; transition trả previous status cho audit writer |
| 3 | notification | NotificationDelivery + DedupeKey VO; NotificationPlan (policy thuần) | S | DedupeKey đang copy-paste 6 chỗ, 3 shape — VO phải tái tạo byte-for-byte; giữ split failure policy (outbox rethrow vs OTP swallow); repo ở admin pool |
| 4 | favorites | Favorite (XOR target VO) | S | add/remove boolean no-throw trước P2002 swallow + partial unique (chỉ có trong SQL tay) |
| 5 | promotions | Promotion (nuốt promotion-discount.ts), PromoRedemption | M | Aggregate đầu tiên trước CAS-SQL: claimUsage/release/markApplied giữ conditional-SQL trong repo; Prepare/Reserve signature đóng băng (booking gọi trong tx của nó); tri-state update (null=clear/absent=keep) giữ nguyên |
| 6 | affiliate | Affiliate, ReferralLink, AffiliateCommission | M | Commission transitions no-throw idempotent; amount = replay đúng computeCommissionSplit của finance; markConfirmedPaid giữ set-based; track-referral giữ projection (hot public path) |
| 7 | identity-access | UserAccount (nuốt login-lockout), Session, AuthChallenge | M | Đảo độc lập: admin pool, không forTenant/outbox. KHÔNG copy pattern repo-nhận-tx vào đây; SessionPrincipal giữ là projection (hot path guard); anti-enumeration no-throw + hash-only token giữ nguyên |
| 8 | partner | Partner (2 lifecycle: status + verification), AgreementAcceptance (append-only record, không phải class) | M | Commit-then-throw khi reject verification giữ HTTP code y hệt; giữ FOR UPDATE row-lock; persistence theo cột (payout/documents/identity không clobber nhau); `assertCanServeListingType` path đóng băng (listing dùng) |
| 9 | catalog | ListingType | M | Tách read/write port để consumer trong listing giữ record shape; public search là read-only, ngoài phạm vi; searchConfig validator về domain với mã lỗi y hệt |
| 10 | tenancy | Tenant, TenantDomainPortfolio, SubscriptionPlan, TenantSubscription (append-only stream) | M | Gần như toàn admin pool — giữ nguyên dual-pool; hợp nhất rule "current subscription" đang nhân ba (TS + 2 bản raw-SQL); atomic swap setPrimary + worker throw-to-retry TXT giữ nguyên |
| 11 | listing | Listing, ListingGroup, CancellationPolicy, PricingRule, Resource | L | Payoff khử trùng lặp lớn nhất (4× group-managed guard, 2× group-binding, 2× mode-subset); moderation machine đã pure; port export cho booking/scheduling/catalog + `priceQuote` path đóng băng; group cascade giữ 1 tx |
| 12 | scheduling | ListingWeeklySchedule, ResourceCalendar | M | Không máy trạng thái, domain fn đã pure — chủ yếu VO extraction; busy-predicate SQL phải byte-sync với GiST; priced-slot generation là composition, không phải state của aggregate |
| 13 | payments | Payment, Refund, TenantGatewayConfig (set-aggregate) | L | Transitions PHẢI giữ CAS (`WHERE status <> 'succeeded'`…); Refund mô hình in-flight qua 2 tx quanh provider call; xóa `canSucceed` (dead code mâu thuẫn SQL guard thật); credential đã giải mã không nằm trong state sống lâu |
| 14 | booking | Booking (1 root + BookingStatusHistory con; VO: Timeslot, BlockedPeriod, Money, CancellationPolicySnapshot, CommissionSnapshot, PromotionSnapshot, FulfillmentState) | L | Nguy hiểm nhất: `applyTransition` giữ optimistic `WHERE status=from`; SlotTaken chỉ do GiST quyết tại write (không bao giờ in-memory); confirm second-tx recovery + emit-không-transition giữ nguyên; dual clock giữ per call-site; payload 4 module tiêu thụ — đóng băng |
| 15 | finance | Settlement, Payout (+PayoutAllocation con), SettlementDispute; CommissionRule + LedgerJournal (mỏng) | XL | Mọi transition guard là SQL (`WHERE` + `LEAST/GREATEST` + `now()`) — aggregate đứng trước, không thay; tái tạo nguyên web idempotency phân tán (upsert, refundId equality, hasRevenueJournal, ensureHeldForBooking) kể cả handler cố ý throw-to-retry; ReleaseSettlement chạy đồng thời worker + relay |
| 16 | administrative-division | AdministrativeAddress (VO bất biến + resolve factory) | S | Rule ward-thuộc-province về VO factory sau signature `ResolveAdministrativeAddressUseCase` không đổi (5 injector ngoài + response cache 24h); repo giữ tx-less có chủ đích |

## 6. Thứ tự 16 PR (tuần tự nghiêm, vào `refactor/entity-centric`)

Nguyên tắc: học pattern trên module nhỏ trước → provider trước consumer → tiền bạc sau cùng.

1. **reviews** (S) — pilot: chứng minh trọn style end-to-end (factory, snapshot port hẹp, P2002
   backstop, in-tx emit) trên 1 aggregate, blast radius nhỏ nhất. Kèm Wave 0 shared kernel
   (`DomainError` + filter, §2.9). **Nguồn khôi phục:** bản pilot 2026-07-20 đã từng viết + verify
   xanh + chạy thật nhưng mất source — còn nguyên bản compiled trong `apps/api/dist/` (
   `shared/domain/domain-error.js`, `modules/reviews/domain/{entities/review.entity,
   value-objects/{rating,review-content}, errors/review-errors}.js` + `.d.ts`) — tái tạo TS từ đó
   thay vì viết lại từ đầu. Tương tự cho AffiliateCommission ở PR #6
   (`modules/affiliate/domain/entities/affiliate-commission.entity.js`).
2. **content-reports** (S) — máy trạng thái đầu tiên; chốt pattern audit pre-image giá rẻ.
3. **notification** (S) — invariant scatter tệ nhất trên mỗi dòng code; 0 endpoint HTTP nên không
   thể vỡ gì user-facing; sinh DedupeKey VO + failure policy tường minh.
4. **favorites** (S) — boolean idempotent add/remove trên DB backstop có sẵn.
5. **promotions** (M) — chốt luật "CAS ở lại repo" mà affiliate/payments/booking/finance phụ thuộc.
6. **affiliate** (M) — áp pattern boolean event-driven vừa chứng minh vào commission lifecycle.
7. **identity-access** (M) — đảo độc lập, không chạm pattern forTenant/outbox.
8. **partner** (M) — provider của listing (`assertCanServeListingType`, `PARTNER_REPOSITORY`) nên
   phải xong trước listing, import path không đổi.
9. **catalog** (M) — provider còn lại của listing (`LISTING_TYPE_REPOSITORY`,
   `assertValidAttributes`).
10. **tenancy** (M) — hợp nhất rule current-subscription nhân ba trước khi các consumer lớn refactor;
    guard/use-case export đóng băng; ghi nhận chính thức ngoại lệ admin-pool.
11. **listing** (L) — khối lượng lớn nhưng rủi ro là volume, không phải novelty (moderation đã pure);
    port của nó che chắn booking/scheduling nên đứng ngay trước.
12. **scheduling** (M) — sau listing để seam priceQuote/pricing đã ổn định.
13. **payments** (L) — ghim choreography event payment/refund trước khi đụng finance settlement.
14. **booking** (L) — aggregate nguy hiểm nhất, xếp muộn khi mọi pattern cần thiết đã thành thói quen.
15. **finance** (XL) — stakes cao nhất (ledger trigger, DB-clock CAS, idempotency web, worker+relay
    đồng thời) — cuối cùng trong nhóm lớn, sau khi payload booking+payments đã đóng băng và 13 module
    convention đã tồn tại.
16. **administrative-division** (S) — nửa ngày, nhét vào lúc rảnh bất kỳ.

Sau PR #1 (pilot reviews): **dừng lại review kỹ style với owner** trước khi làm tiếp — pilot là nơi
rẻ nhất để chỉnh style, mọi PR sau copy pattern từ nó.

## 7. Cập nhật docs đi kèm (trong PR tương ứng)

- PR pilot: cập nhật `apps/api/CLAUDE.md` (module shape đã hứa `domain/{entities, ports}` — bổ sung
  mô tả style entity chuẩn + link spec này); thêm mục vào `docs/conventions.md`.
- PR cuối: cập nhật `docs/architecture.md`; cân nhắc ADR mới "0007 — entity-centric domain layer"
  ghi lại quyết định này.

## 8. Sổ đăng ký (không sửa trong refactor)

### 8a. Known-gap register — invariant phát hiện nhưng chưa enforce (giữ nguyên, siết sau)

| Gap | Module | Hiện trạng |
|---|---|---|
| Affiliate status không có transition graph (any→any; approve đè suspended âm thầm) | affiliate | Use-case set thẳng status |
| ContentReport moderation status any→any | content-reports | Không có máy trạng thái |
| Tenant/tenancy status writes any→any | tenancy | Không có transition guard |
| Partner re-submit identity reset cả partner đã verified; đổi tên payout holder không re-trigger name-match | partner | Không guard theo verification state |
| Scheduling: cho phép 2 window cùng weekday chồng nhau; row "closed" vẫn mang hours | scheduling | Không validate shape |
| Promotions: end-partner-promotion thiếu guard "đã ended" | promotions | Idempotent-by-accident |
| P2002 leak thành 500 (partner slug, plan-name create) | partner, tenancy | Thiếu translation — fix là behavior change của error envelope → ghi sổ |
| Finance: `SetPlatformRate` use-case tồn tại nhưng không có route | finance | Cần owner quyết: nối route hay xóa |

### 8b. Migration wave sau refactor (unique backstop còn thiếu)

- `notification.dedupe_key` thành cột thật + unique index (kèm quyết định backfill row lịch sử)
- `refunds (booking_id, reason)` unique (advisory-lock idempotency hiện không có DB backstop)
- Single-dispute-per-settlement backstop
- One-primary-domain partial unique (tenancy)

### 8b-bis. Read-side follow-ups (ghi nhận trong refactor, sửa sau — có thể đổi wire)

- content-reports: response đang leak key `targetType` thừa cạnh `target` (repo `toRecord` spread
  row + mapper spread record) — bỏ nó là wire change, cần duyệt riêng.
- content-reports reader port: `reason: CreateContentReportInput['reason']` → nên dùng thẳng
  `ContentReportReason` (cleanup type-only, không đổi wire) — đừng copy indirection này sang các
  reader port module sau.
- Clock: content-reports `handledAt` dùng app-clock `new Date()` (giữ nguyên trong refactor) — mục
  đổi sang DB clock nằm trong danh sách clock follow-up chung (§3 Đồng hồ).
- favorites: `toVnd` + `priceFromModeConfig` trong `prisma-favorite.repository.ts` là bản sao gần
  như y hệt của `catalog.mapper.ts` — nên hợp nhất về một nơi dùng chung (giữ `priceFrom` là chuỗi
  chữ số VND ở boundary), nhưng là read-side + xuyên module nên tách khỏi refactor này.

### 8c. Dead-code list (xóa trong PR module sở hữu)

- `payments`: `canSucceed` (mâu thuẫn SQL guard thật — cái bẫy), `findActivePendingByBooking`
- `catalog`: `ListPublicListingsUseCase` không có route
- `favorites`: `isFavorited` (port + repo, 0 caller) — **đã xoá ở PR #4**

### 8c-bis. Tooling & fixture follow-ups (PR nhỏ riêng, KHÔNG nhét vào PR module)

Từ final review PR #4 — làm sớm vì càng để lâu càng nhiều module copy:

1. **[ĐÃ LÀM]** **Lint chặn bypass port (làm TRƯỚC PR #5).** Pattern `useExisting` bắt buộc đăng ký class Prisma
   dưới token của chính nó, nên một use-case tương lai có thể inject thẳng class infrastructure mà
   vẫn typecheck xanh (hiện chưa có chỗ nào làm vậy, và `eslint.config.mjs` không có rule chặn).
   Thêm override `no-restricted-imports` cho `apps/api/src/modules/**/{application,domain}/**` cấm
   import `**/infrastructure/**`, kèm 1 câu vào §3 style-gate mục 1 ("không bao giờ inject class cụ
   thể — chỉ qua port").
2. **Seed fixture chưa-published (làm TRƯỚC PR #9 catalog / #11 listing).** Tenant StudioHub hiện có
   0 listing/group `status <> 'published'`, nên smoke của rule "chỉ target published" phải thay bằng
   id không tồn tại (cùng nhánh code, nhưng không phải cùng dữ liệu). Thêm 1 listing + 1 group
   `draft` vào seed.
3. **Type-only bookkeeping:** reader port của favorites lặp literal `'listing' | 'group'` 5 chỗ thay
   vì dùng `FavoriteTargetKind` (giữ nguyên ở PR #4 vì read side đóng băng) — đừng copy kiểu này
   sang reader port của các module sau.

### 8d. Track B — I/O hardening (dự án riêng sau refactor, đã khảo sát 2026-07-20)

Không thuộc refactor này nhưng ghi lại để không thất lạc lần nữa: ~65 endpoint loose-typed;
`payments` credentials `Record<string,string>` → discriminated union per-gateway (đổi wire + đụng FE
+ security); `gatewayPayload`/Evidence typed; khử `unknown`/jsonb tự do ở boundary.

## 9. Xác minh mỗi PR (ADR 0005 — không có test)

1. `pnpm turbo lint typecheck build` xanh.
2. Chạy app seed (`docker compose up -d` → `prisma:deploy` → `seed` → `pnpm dev`) và bấm tay **mọi
   write-flow của module** vừa refactor; module tiền bạc phải đi trọn vòng
   checkout → confirm → cancel/refund trên storefront + dashboard.
   *Gotcha môi trường:* port 5432 có thể bị container `kaigo-postgres-dev` (project khác) chiếm —
   nhờ user tự stop/start nó, không tự ý đụng; Node phải là 22.22.0 (`nvm use`).
3. PR description liệt kê: use-case đã chuyển đổi, surface đã freeze (và bằng chứng không đổi),
   hành vi throw/no-op từng outbox handler trước/sau, dead code đã xóa.
4. `check:rls` xanh (không đổi vì schema-frozen, chạy để chắc).

## 10. Ngoài phạm vi (out of scope)

- Đổi read side / response shape / contracts / frontend.
- Mọi migration schema (→ §8b wave riêng).
- Siết behavior gap (→ §8a, follow-up sau refactor).
- Versioning outbox event schema (giữ payload đóng băng; nếu owner muốn version hóa thì là dự án
  riêng sau).
- Đổi nguồn clock app→DB ở các call-site đang lệch (ghi chú trong PR, làm follow-up).
