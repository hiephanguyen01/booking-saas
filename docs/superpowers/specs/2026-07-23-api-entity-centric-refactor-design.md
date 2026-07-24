# Design: Entity-centric refactor toàn bộ `apps/api` (Rich DDD aggregate)

**Ngày:** 2026-07-23 · **Trạng thái:** Đã triển khai 16/16 module; final review toàn nhánh đạt 2026-07-24
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
    (relay at-least-once; hậu hardening có tối đa 20 lần thử rồi dead-letter). Handler nào hôm nay
    *cố ý* throw-để-retry (finance ordering-recovery, tenancy DNS TXT check) **giữ nguyên throw**,
    ghi chú "retryable"; lỗi nghiệp vụ không được tiêu retry budget.
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
5. **Import enum/union type từ `@booking/contracts` khi đã có sẵn** thay vì khai lại union cục bộ
   trong entity (union cục bộ sẽ trôi khi enum được mở rộng). Ví dụ vừa gặp: `TenantStatus` đã có
   ở contracts nhưng `tenant.entity.ts` khai lại.
6. **Không thêm getter/method không có consumer** trên entity. Ngoài chuyện thừa, một getter như
   `belongsToTenant` còn *gợi ý sai* rằng việc kiểm tra ownership diễn ra ở entity — trong khi ở
   các path chạy trên admin pool (không có RLS) việc kiểm tra đó **phải** ở lại trên record thô
   trước khi rehydrate.

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
| **[ĐÃ ĐÓNG 2026-07-24]** ContentReport moderation status any→any | content-reports | `open → reviewing → resolved|dismissed`; terminal immutable; repository CAS theo status, loser `409 CONTENT_REPORT_STATE_CHANGED` |
| Tenant/tenancy status writes any→any | tenancy | Không có transition guard |
| Partner re-submit identity reset cả partner đã verified; đổi tên payout holder không re-trigger name-match | partner | Không guard theo verification state |
| Scheduling: cho phép 2 window cùng weekday chồng nhau; row "closed" vẫn mang hours | scheduling | Không validate shape |
| Promotions: end-partner-promotion thiếu guard "đã ended" | promotions | Idempotent-by-accident |
| P2002 leak thành 500 (partner slug, plan-name create) | partner, tenancy | Thiếu translation — fix là behavior change của error envelope → ghi sổ |
| **[ĐÃ ĐÓNG 2026-07-24]** Finance: `SetPlatformRate` use-case tồn tại nhưng không có route | finance | Owner chọn xoá use-case + provider + port/repo method + request contract; không mở surface mới |
| P2002 leak thành 500 (listing-type slug) + FK violation khi delete không dịch | catalog | Giữ nguyên ở PR #9 — fix là behavior change của error envelope |
| `add-domain` cho phép tạo primary thứ hai (nhận thẳng `isPrimary` từ request, không tự clear primary cũ; không có DB constraint chặn 2 hàng `is_primary=true` cùng tenant) | tenancy | Giữ nguyên ở PR #10a; **đã đóng hậu refactor** bằng atomic primary swap + partial unique index |
| `delete-domain` (`assertDeletableFromPortfolio`) thực chất bảo vệ "còn ít nhất 1 domain **verified**", không phải "còn primary" — xoá domain primary trong khi còn domain verified khác (không primary) vẫn thành công và để tenant không còn domain nào là primary | tenancy | Bất đối xứng kế thừa từ code cũ, giữ nguyên ở PR #10a |
| **[ĐÃ ĐÓNG 2026-07-24]** Bốn bản "current subscription" bất đồng | tenancy | Một `ICurrentSubscriptionReader`/Prisma adapter chọn `starts_at DESC, created_at DESC`, resolve plan và trả PostgreSQL `now()` trong cùng statement; guard, host, count, limits và health dùng adapter này |
| **[ĐÃ ĐÓNG 2026-07-24]** `GetPlanLimitsUseCase` cấp limit cho subscription đã chết | tenancy | Limits chỉ trả khi `evaluateSubscription(current, evaluatedAt).phase === 'active'`, cùng DB clock với selection |
| `create-plan` không pre-check tên trùng trước khi insert ⇒ tên trùng leak thẳng Prisma `P2002` thay vì 409 dịch nghĩa (đường `update-plan` đã có pre-check tên) | tenancy | Giữ nguyên ở PR #10b, cùng loại với hàng "P2002 leak thành 500" phía trên |
| Pricing-rule overlap check (`date_time_range` chồng window + replace `date_range`/`fixed` cùng params) **chỉ** chạy ở partner path (`create-partner-pricing-rule`); tenant path (`create-pricing-rule`) không kiểm overlap, không replace — tenant tạo được rule chồng window | listing | Giữ nguyên ở PR #11a (bất đối xứng kế thừa từ code cũ) |
| `create-resource` nhận `partnerId` từ request và không kiểm partner đó có thuộc tenant hiện tại không (không guard partnerId-belongs-to-tenant); RLS chặn cross-tenant ghi nhưng partnerId sai-trong-tenant không bị bắt | listing | Giữ nguyên ở PR #11a |
| Hai payload `pricing_rule.deleted` khác nhau: tenant `delete-pricing-rule` emit `{pricingRuleId}` (KHÔNG listingId), partner `delete-partner-pricing-rule` emit `{pricingRuleId, listingId}` (CÓ listingId) — consumer phải chịu cả hai shape | listing | Giữ nguyên ở PR #11a (bất đối xứng kế thừa; hợp nhất là wire change) |
| Replace-match của pricing-rule (`sameWindowKey`) so `JSON.stringify(params)` của candidate với row đã lưu, nhưng Postgres `jsonb` **sắp xếp lại thứ tự key** khi round-trip (vd `{from,to}` → `{to,from}`) còn candidate giữ nguyên thứ tự client gửi ⇒ replace **chỉ fire khi FE tình cờ serialize đúng thứ tự canonical của jsonb**; thứ tự khác → không match → tạo row thứ hai thay vì thay thế (smoke #11a case 7 phát hiện). Hành vi copy nguyên văn từ code cũ (Task 4 review opus xác nhận predicate byte-identical) — **không phải regression** | listing | Giữ nguyên ở PR #11a; fix đúng là so field-wise theo giá trị (không JSON.stringify cả object) — behavior change nhỏ, tách sau |
| **[ĐÃ ĐÓNG 2026-07-24]** `moderate()/update()` không CAS | listing | Repository moderation guard `status=expectedStatus`; content update guard `updated_at=expectedUpdatedAt`; loser `409 LISTING_STATE_CHANGED`, audit/outbox chỉ sau success |
| **[ĐÃ ĐÓNG 2026-07-24]** `transitionHide` any→archived | listing | Chỉ `pending_review|published → archived`; draft/archived nhận `LISTING_NOT_HIDEABLE` |
| **3 shape "not owned" cho listing**: `LISTING_NOT_OWNED`/403/`This listing belongs to another partner` (update), `LISTING_NOT_OWNED`/403/`Listing belongs to another partner` (delete, KHÔNG "This"), `NOT_OWNED`/403/`This resource belongs to another partner` (submit/hide/republish qua `assertOwnership`) — 3 class riêng, giữ cả 3 | listing | Giữ nguyên ở PR #11b |
| `GROUP_MANAGED_LISTING` 1 code / 4 message (submit/publish/republish/hide); `LISTING_GROUP_READ_ONLY` 1 code / 2 message (changing vs deleting its items); `INVALID_ADMINISTRATIVE_DIVISION` 1 code / 2 message (ward-province mismatch vs "both codes required") | listing | Giữ nguyên ở PR #11b |
| **delete group-read-only guard chỉ chạy khi `requirePartnerId`** (partner path) — tenant-scoped delete bỏ qua "hide the group first" mà update + partner-delete đều enforce ⇒ tenant admin xoá được listing thuộc group non-draft | listing | Bất đối xứng kế thừa, giữ nguyên ở PR #11b |
| `resourceId` trong `UpdateListingInput` **bị âm thầm bỏ** (immutable sau create — port `UpdateListingData` Omit nó); client gửi vẫn validate nhưng vô hiệu | listing | Giữ nguyên ở PR #11b |
| `assertCanServeListingType` (partner identity-verification gate) chạy ở create, **KHÔNG** re-check ở update | listing | Giữ nguyên ở PR #11b |
| `publish-listing`: `checklistPassed` (ảnh/mô tả/giá theo mode/CS policy) **chỉ để audit reason**, KHÔNG chặn publish; chỉ `contactFlags` (+ vắng `force`) mới chặn (`LISTING_HAS_CONTACT_INFO`) | listing | Giữ nguyên ở PR #11b |
| `stampModerationTimestamps` dùng **app-clock `new Date()`** (không DB clock) — entity không đọc clock; use-case truyền `new Date()` vào máy moderation shared | listing | Giữ nguyên ở PR #11b (clock follow-up chung §3) |
| `listing.hidden` outbox payload **bỏ `reason`** (dù audit log có); notification đọc `payload.reason` optional → luôn `undefined` cho event này | listing | Giữ nguyên ở PR #11b |
| create-listing auto-provision resource gọi thẳng `resources.create` — cùng gap #11a (partnerId không check thuộc tenant); create/update/delete-listing **không ghi audit** (chỉ 5 moderation ghi); `listing.created`/`.deleted`/`.submitted` hiện **0 consumer** | listing | Giữ nguyên ở PR #11b |
| `LISTING_GROUP_NOT_OWNED` 1-code/2-message: bind child listing vào group người khác = `The listing group belongs to another partner` (#11b `ListingGroupNotOwned`); group tự update/delete = `Listing group belongs to another partner` KHÔNG "The" (#11c `ListingGroupNotOwnedForManage`) — 2 class riêng | listing | Giữ nguyên ở PR #11c |
| `LISTING_GROUP_READ_ONLY` 1-code/3-message: `changing its items` / `deleting its items` (#11b bind gate) + `Hide the listing group before editing it` (#11c group tự edit) — 3 class riêng | listing | Giữ nguyên ở PR #11c |
| **Group moderation cascade: đúng 1 audit row + 1 outbox `{groupId}` cho GROUP**, KHÔNG per-child audit, KHÔNG per-child outbox (`run-group-moderation.ts`). Child status đổi qua loop `transition*` từng row (publish child hardcode actor `'admin'`; hide/republish child dùng `actorFromOutcome` = hiddenBy/publishedBy của group). (Sửa `entity-centric-survey.md:987` nói nhầm "N audit row") | listing | Giữ nguyên ở PR #11c |
| **Group-cascade publish/hide KHÔNG fan-out `listing.published`/`listing.hidden`** cho child ⇒ child group-managed không gửi email (notification) / không trigger scheduling. Pre-existing | listing | Giữ nguyên ở PR #11c |
| **Reopen cascade** (`update-listing-group`, partner + status='archived'): ghi thẳng `{status:draft, publishedBy:null, hiddenBy:null}` cho group + mọi child (Promise.all), emit `listing_group.reopened` payload **`{listingGroupId}`** (khác key `{groupId}` của moderation event); **KHÔNG audit**; **bypass transition machine** (kể cả admin-lock của group) | listing | Giữ nguyên ở PR #11c |
| Group **delete không status-gate** (any-status + 0-child là xoá được, kể cả published-rỗng); tenant-scoped update **được reassign `partnerId`/`listingTypeId`** (partner-scoped force undefined) | listing | Giữ nguyên ở PR #11c |
| Payload key group event: CRUD (`created`/`updated`/`reopened`/`deleted`) = `{listingGroupId}`; moderation (`submitted`/`published`/`hidden`) = `{groupId}` — 0 consumer nên chưa normalize (normalize = wire change) | listing | Giữ nguyên ở PR #11c |
| `confirm-manual-refund` còn một nhánh defensive throw `NotFoundException()` trần sau guarded update — body Nest mặc định không có `code`, khác các lỗi payments còn lại | payments | Giữ nguyên ở PR #13 để wire byte-identical |
| DB enum `PaymentGateway` có `vnpay` nhưng `GatewayKey` TypeScript không có; code runtime không thể route/configure VNPAY | payments | Giữ nguyên ở PR #13; mở rộng gateway là thay đổi feature/wire riêng |
| Ba guarded update refund (`completeAutomatic`/`requireManual`/`markSucceeded`) luôn re-read và trả row hiện tại bất kể guard có match; `null` chỉ có nghĩa row không tồn tại, không biểu diễn CAS miss | payments | Giữ nguyên ở PR #13 vì caller hiện dựa vào return quirk này |
| Manual refund reference chỉ unique bằng query app-level theo tenant, không có DB unique backstop nên hai confirmation đồng thời vẫn có thể dùng trùng reference | payments | Giữ nguyên ở PR #13; thêm unique backstop trong migration wave §8b |

### 8a-bis. Wire change đã duyệt (không phải known gap — thay đổi có chủ đích)

- **`TENANT_NOT_FOUND`** (tenancy): message đổi từ `` `Tenant ${id} not found` `` (per-instance, id động)
  sang `'Tenant not found'` (tĩnh) dùng chung `shared/domain/errors/tenant-not-found.ts` — cùng
  code (`TENANT_NOT_FOUND`) và cùng status (404), chỉ message đổi. **Owner duyệt 2026-07-24**, áp
  dụng cho **cả 8 site** phát ra mã này trong tenancy (`get-tenant`, `get-tenant-detail`,
  `update-tenant`, `set-partner-promotions`, `set-tenant-default-cancellation-policy`, `add-domain`,
  và 2 site thuộc PR #10b — `assign-subscription`, `list-subscriptions`) để không nửa vời trong cùng
  module. FE đã grep, không bám vào message literal của mã này. Đây là **thay đổi wire có chủ đích
  duy nhất** của toàn bộ refactor entity-centric tính tới PR #10a — mọi mã lỗi khác vẫn giữ
  byte-identical theo luật §4.
- **Envelope-normalization partner-path pricing-rule** (listing, PR #11a): các throw ở
  `create-partner-pricing-rule` (`LISTING_NOT_FOUND`, `LISTING_NOT_OWNED`, `MODE_NOT_ENABLED`) và
  `delete-partner-pricing-rule` (`LISTING_NOT_FOUND`, `LISTING_NOT_OWNED`, `PRICING_RULE_NOT_FOUND`)
  trước đây phát body **thiếu `statusCode`** (`{code, message}`); đi qua `DomainError` +
  `DomainExceptionFilter` nay body **có thêm `statusCode`** — khớp envelope tài liệu, **giống hệt các
  throw tenant-path** vốn đã có `statusCode`. **Vô hình với consumer**: `@booking/api-client`
  (`errors.ts`) đọc `status` từ HTTP status line + `message`/`error`/`code` từ body, **không đọc
  `body.statusCode`**. Code + message + HTTP status line giữ byte-identical; đây **không** phải đổi
  hợp đồng, chỉ chuẩn hóa shape body bất đối xứng kế thừa.

### 8b. Migration wave sau refactor (đã đối soát và hoàn tất)

- **[ĐÃ LÀM hậu refactor]** `notification_logs.dedupe_key` thành cột thật, backfill từ payload và
  partial unique cho row `sent`; one-primary-domain partial unique nằm trong
  `20260724120000_entity_post_refactor_hardening`.
- **[ĐÃ CÓ từ trước]** `refunds (booking_id, reason)` và single-dispute-per-settlement nằm trong
  `20260719120000_finance_lifecycle_hardening`; manual-refund evidence reference unique theo tenant
  nằm trong `20260721170000_payment_methods_and_refund_settings`. Không tạo index trùng ở wave mới.

### 8b-bis. Read-side follow-ups (ghi nhận trong refactor, sửa sau — có thể đổi wire)

- **[ĐÃ CHỐT 2026-07-24]** content-reports giữ `targetType` như compatibility alias deprecated cạnh
  `target`. Contract khai báo cả hai và mapper enumerate field explicit; không còn persistence-key
  leak qua object spread. Xoá alias cần deprecation/removal wave riêng.
- **[ĐÃ LÀM hậu refactor]** content-reports reader port dùng thẳng `ContentReportReason`.
- **[ĐÃ LÀM hậu refactor]** content-reports `handledAt` dùng DB clock lấy trong cùng tenant tx.
- favorites: `toVnd` + `priceFromModeConfig` trong `prisma-favorite.repository.ts` là bản sao gần
  như y hệt của `catalog.mapper.ts` — nên hợp nhất về một nơi dùng chung (giữ `priceFrom` là chuỗi
  chữ số VND ở boundary), nhưng là read-side + xuyên module nên tách khỏi refactor này.
- tenancy: `resolve-tenant-by-host` (`ResolveTenantByHostUseCase`) còn giữ rule nghiệp vụ inline
  ngay trong use-case thay vì trên aggregate — "chỉ domain **verified** mới resolve host" và
  `isLive = tenant.status === 'active' && evaluation.storefrontLive`. Đây là read path với **14
  consumer xuyên module** (bề mặt đóng băng, xem HANDOFF gợi ý tenancy) nên để nguyên, tách refactor
  riêng sau khi khảo sát hết 14 consumer.
- **[ĐÃ LÀM hậu refactor]** tenancy: bốn mutation domain (`add-domain`, `verify-domain`,
  `set-primary-domain`, `delete-domain`) trước đây không gọi `cache.invalidateHost`, khiến
  positive/negative cache stale tối đa 60s. Hardening hiện invalidate host liên quan sau commit;
  add-domain primary cũng swap primary atomically trong cùng RLS transaction.
- **[ĐÃ LÀM 2026-07-24]** tenancy không còn hai clock cho subscription. Current reader trả
  PostgreSQL `now()` cùng selection; mọi `evaluateSubscription`, limits, live counts và health dùng
  timestamp đó.
- **[ĐÃ LÀM hậu refactor] listing:** PR #11b/#11c chủ đích giữ bộ máy moderation dùng chung dưới
  dạng pure function + application shim để không phá đường group khi hai phần chưa cùng hoàn tất.
  Hardening sau đó đã promote `ModerationError` thành `DomainError`, fold transition vào
  `Listing`/`ListingGroup`, và xoá `runModeration` shim; code/status/message và wire giữ nguyên.

### 8c. Dead-code list (xóa trong PR module sở hữu)

- `payments`: `canSucceed` (mâu thuẫn SQL guard thật — cái bẫy), `findActivePendingByBooking`
  — **[ĐÃ XOÁ ở PR #13]**
- `catalog`: `ListPublicListingsUseCase` không có route — **[ĐÃ XOÁ ở PR #9]**
- `favorites`: `isFavorited` (port + repo, 0 caller) — **đã xoá ở PR #4**
- **[ĐÃ XOÁ hậu refactor]** `catalog.mapper.ts`'s `toPublicListingResponse`, và `listPublicListingsQuerySchema` +
  `publicListingsFilterSchema` trong `packages/contracts/src/contracts/listing-type.ts` — 0 consumer,
  xác nhận lại ở final review PR #9 nhưng **cố ý KHÔNG xoá** vì là read-side/shared-package (xoá cần
  rebuild `contracts` + verify lại frontend); hardening đã xoá và rebuild toàn workspace.

### 8c-bis. Tooling & fixture follow-ups (PR nhỏ riêng, KHÔNG nhét vào PR module)

Từ final review PR #4 — làm sớm vì càng để lâu càng nhiều module copy:

1. **[ĐÃ LÀM]** **Lint chặn bypass port (làm TRƯỚC PR #5).** Pattern `useExisting` bắt buộc đăng ký class Prisma
   dưới token của chính nó, nên một use-case tương lai có thể inject thẳng class infrastructure mà
   vẫn typecheck xanh (hiện chưa có chỗ nào làm vậy, và `eslint.config.mjs` không có rule chặn).
   Thêm override `no-restricted-imports` cho `apps/api/src/modules/**/{application,domain}/**` cấm
   import `**/infrastructure/**`, kèm 1 câu vào §3 style-gate mục 1 ("không bao giờ inject class cụ
   thể — chỉ qua port").
2. **[ĐÃ LÀM hậu refactor] Seed fixture chưa-published.** Tenant StudioHub trước đây có
   0 listing/group `status <> 'published'`, nên smoke của rule "chỉ target published" phải thay bằng
   id không tồn tại (cùng nhánh code, nhưng không phải cùng dữ liệu). Thêm 1 listing + 1 group
   `draft` vào seed; hiện có fixture id ổn định cho một listing và một group draft.
3. **Type-only bookkeeping:** reader port của favorites lặp literal `'listing' | 'group'` 5 chỗ thay
   vì dùng `FavoriteTargetKind` (giữ nguyên ở PR #4 vì read side đóng băng) — đừng copy kiểu này
   sang reader port của các module sau.
4. **[ĐÃ LÀM hậu refactor] turbo không hash `eslint.config.mjs` gốc** (phát hiện khi làm mục 1):
   `turbo.json` không liệt kê
   config lint/tsconfig gốc trong `inputs`, nên sau khi đổi rule lint mà chạy `pnpm turbo lint` có thể
   trúng cache cũ và báo xanh giả — CI cũng vậy (phải `--force` mới thấy thật). Thêm chúng vào
   `inputs`/`globalDependencies` trong một PR tooling riêng; hardening đã thêm config gốc và
   `packages/config` vào `globalDependencies`.
5. **[ĐÃ LÀM hậu refactor] promotions import chéo module partner** (`AGREEMENT_REPOSITORY` +
   `PrismaAgreementRepository` trong `opt-in-promotion` và module wiring) — vi phạm ADR 0003 có sẵn
   từ trước, PR #5a giữ nguyên. Promotions hiện sở hữu `PROMO_AGREEMENT_RECORDER` và adapter cục bộ,
   ghi agreement trong cùng tenant transaction.
6. **[ĐÃ LÀM ở PR #5b]** Hoãn sang PR #5b (nó đụng lại module promotions nên gộp vào cho gọn), từ
   final review PR #5a:
   - xoá 2 hằng số chết `PROMO_SCOPE_TARGET_INVALID_CODE` (`assert-scope-target.ts`) và
     `PROMO_TENANT_SHARE_NEGATIVE_CODE` (`assert-tenant-share-risk.ts`) — 0 consumer toàn repo;
   - quyết định về khối chuyển kiểu `vnd()`/`new Date()` đang trùng giữa `update-promotion` và
     `update-partner-promotion` (tách helper `toPromotionUpdateInput` hay chấp nhận trùng) — **chốt
     thành convention**, vì các module update-heavy sau (booking, payments) sẽ copy hình dạng này;
   - **Convention đã chốt:** module update-heavy tách MỘT converter wire→domain dùng chung trong
     `application/` (`toXxxUpdateInput(input): XxxUpdateInput`), giữ tri-state theo từng key
     (`undefined` = giữ, `null` = xoá, và `null` không đi qua `vnd()`/`new Date()`). Tiền lệ:
     `promotions/application/to-promotion-update-input.ts` (PR #5b).
   - chạy lại regression "đặt booking có promo code" sau khi #5b đổi seam `claimUsage`/`reserve`.
7. **`rejectionException` (promotions) đã hợp nhất ở PR #14** — `PromoRejectionError` giữ nguyên
   status/code/`message === code`; `confirm-booking.use-case.ts` đổi đồng bộ và chỉ nuốt
   `PromoRejectionError` có code `PROMO_LIMIT_REACHED` trên đường late-webhook.
8. **[ĐÃ LÀM hậu refactor] Outbox relay trước đây không có dead-letter/max-attempts park** (phát
   hiện ở final review PR #5b): relay hiện park sau 20 lần lỗi bằng `dead_lettered_at`, query claim
   bỏ qua row park và timing dùng DB clock.
9. **[ĐÃ LÀM ở final review toàn nhánh] Pattern `event.tenantId ?? ''`** — scheduling/payments/
   booking/finance normalize trong PR #12–#15; listing được carry cuối cùng. Mọi handler tenant-scoped
   giờ validate-and-skip-with-log thay vì đưa chuỗi rỗng vào RLS. Mục 8 cũng đã đóng hậu refactor.
10. **`requireTenantId` copy per module là quyết định có chủ đích, không phải trôi dạt** — không
    hoist vào `shared/outbox` vì message log + eventType khác nhau mỗi module, và hoist sớm sẽ đóng
    băng shape trước khi thấy đủ số lần lặp để biết đâu là phần chung thật sự. Giữ copy per module
    cho tới khi vượt ~13 bản; nếu vượt, revisit việc hoist.

### 8d. Track B — I/O hardening (đã duyệt/đóng scope 2026-07-24)

- Controller audit còn đúng một raw `Record<string, unknown>` ở catalog query; đã thay bằng typed
  contract + named pipe, giữ nguyên `INVALID_CATALOG_SEARCH` envelope.
- Payment credentials là discriminated union per gateway (SePay/PayOS/MoMo/ZaloPay/mock). HTTP input
  và JSON sau giải mã đều validate; adapter không còn nhận secret thiếu dưới dạng chuỗi rỗng.
- Checkout `gatewayPayload`, payment-completion payload và refund evidence có type/schema; legacy
  `{paymentUrl}` checkout row vẫn đọc được.
- `unknown` còn lại được allowlist: incoming outbox/provider data phải narrow ngay; tenant
  theme/settings, listing attributes/mode config và historical snapshots là JSON động theo product.
  Không đóng giả schema cho các field động này.

### 8e. Audit coverage toàn bộ use-case (đã làm hậu refactor 2026-07-24)

Audit AST/import graph trên 257 `modules/**/*.use-case.ts` không dùng tên file làm kết luận:

- 216 file đã đi tới entity/VO/pure domain policy; 41 file còn lại được đọc thủ công và phân loại.
- Không ép 27 query, 6 adapter-backed state machine, 2 set-based transition, 1 boundary validation
  và 1 projection command tạo entity không có state/invariant.
- Bốn business rule còn inline đã được đưa vào domain: `Settlement.canOpenDispute`,
  `PayoutPolicy.define/toStored/toDto`, và `ListingDepositPolicy` dùng chung cho assert + preview.
- Ba application persistence bypass phát hiện cùng lúc đã qua local port/adapter: payout settings,
  review aggregate projection và booking partner `isHouse`.
- Kết quả sau sửa: 220/257 đi tới domain policy, 184 đi tới entity/VO; 37 entity-free còn lại đều là
  orchestration có chủ đích. Application use-case không còn direct Prisma model/raw SQL.

Xem plan có frozen-wire matrix và inventory:
[`2026-07-24-entity-centric-use-case-audit-hardening.md`](../plans/2026-07-24-entity-centric-use-case-audit-hardening.md).

### 8f. Typed application errors (đã làm hậu refactor 2026-07-24)

AST audit trên application layer tìm 82 site `throw new *Exception`: 77 custom payload và 5 bare.
Hai helper khác trả về custom exception, nên baseline có 79 inline custom construction.

- Tất cả 79 custom construction đã rời use-case/helper. Standard 4xx dùng typed `DomainError`;
  legacy/auth/provider/5xx shape dùng named Nest exception trong application error file.
- Năm bare Nest exception được giữ vì chúng cố ý dùng default Nest body.
- Error tuple dùng xuyên module nằm trong `shared/domain/errors`; module-owned message variant ở
  `domain/errors`; exact tuple duplicate scan không còn kết quả.
- Không đổi status/code/message/details; các legacy body thiếu `statusCode` và OTP top-level retry
  field được giữ nguyên.

Xem inventory, allowlist và frozen-wire matrix:
[`2026-07-24-application-error-deduplication.md`](../plans/2026-07-24-application-error-deduplication.md).

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
