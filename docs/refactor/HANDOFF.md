# Bàn giao — Entity-centric refactor `apps/api`

> Đọc file này **đầu tiên** nếu bạn (người hoặc AI) tiếp quản công việc refactor này trên một máy
> khác / một phiên khác. Cập nhật lần cuối: **2026-07-24**, sau đợt hardening hậu refactor.

## 0. Vì sao cần file này

Hai thứ **không** đi theo git, nên phải chép lại ở đây:

- **memory của trợ lý AI** (`~/.claude/projects/<project>/memory/`) — máy khác không có.
- **sổ tiến độ** `.superpowers/sdd/progress.md` — thư mục này bị `.gitignore`.

Mọi thứ còn lại (spec, khảo sát, plan từng PR) **đều đã ở trong repo** — xem §2.

## 1. Đang ở đâu

Nhánh tích hợp: **`refactor/entity-centric`** (mọi PR module merge vào đây, **không** vào `main`;
`main` sync vào định kỳ, merge ra `main` một lần khi xong hoặc theo mốc owner quyết).

| # | Module | Trạng thái |
|---|---|---|
| — | shared kernel `DomainError` + global filter | ✅ merge (PR #15) |
| 1 | reviews | ✅ merge (PR #15) |
| 2 | content-reports | ✅ merge (PR #16) |
| 3 | notification | ✅ merge (PR #17) |
| 4 | favorites | ✅ merge (PR #18) |
| — | lint guard biên hexagonal | ✅ merge (PR #19) |
| 5a | promotions — vòng đời chương trình | ✅ merge (PR #20) |
| 5b | promotions — redemption + usage claim | ✅ merge (PR #21) — **promotions xong cả module** |
| 6 | affiliate | ✅ merge (GitHub PR #22) |
| 7 | identity-access | ✅ merge (GitHub PR #23) |
| 8 | partner | ✅ merge (GitHub PR #24) |
| 9 | catalog | ✅ merge (GitHub PR #26) |
| 10a | tenancy — Tenant + domains | ✅ merge (GitHub PR #27) |
| 10b | tenancy — plan + subscription | ✅ merge (GitHub PR #28) — **tenancy xong cả module** |
| 11a | listing — cancellation-policy + pricing-rule + resource | ✅ merge (GitHub PR #29) |
| 11b | listing — Listing content + moderation | ✅ merge (GitHub PR #30) |
| 11c | listing — ListingGroup + cascade | ✅ merge (GitHub PR #31) — **listing xong cả module** |
| 12 | scheduling | ✅ merge (GitHub PR #32) |
| 13 | payments | ✅ merge local (`0e53b18`) |
| 14 | booking | ✅ merge local (`5b8aa12`) |
| 15 | finance | ✅ merge local (`ccc8178`) |
| 16 | administrative-division | ✅ merge local (`90963a3`) |

**listing tách 3 PR con** (module lớn nhất: 45 use-case, 56 endpoint) — ✅ cả 3 merged (PR
#29/#30/#31). Scheduling đã merge ở PR #32; payments, booking, finance và
administrative-division cũng đã merge local vào integration: **16/16 module đã nằm trên
`refactor/entity-centric` và final review toàn nhánh đã đạt**.

Booking #14 đã đưa lifecycle qua aggregate, giữ CAS/GiST/second-tx và sửa đồng bộ
`rejectionException` promotions↔booking. Finance #15 đã đưa CommissionRule/Settlement/Payout/
SettlementDispute/LedgerJournal/PayoutPolicy về entity-centric, giữ nguyên repository SQL,
DB-clock/CAS, FIFO allocation và event order; finance outbox cũng đã normalize tenantId.
Administrative-division #16 đã đưa membership province↔ward về immutable `AdministrativeAddress`,
giữ resolver signature, tx-less global catalog và cache 24h. Đợt hardening hậu refactor sau đó đã
đóng các nợ có quyết định rõ: relay park sau 20 lần lỗi, migration backstop, fixture draft, turbo
hash config, promotions sở hữu port ghi agreement, moderation nằm trên aggregate, fulfillment
pickup/return có CAS, content-report dùng DB clock, và mutation domain tenancy invalidate host cache.
Vòng quyết định cuối đã xoá `SetPlatformRate` unreachable, formalize alias `targetType`, hợp nhất
current subscription, harden gateway/JSON boundary và siết moderation CAS/state transition. Các hàng
chưa đóng trong spec §8a là backlog product được giữ có chủ đích, không phải việc refactor còn dang dở.
Việc kế tiếp là **đưa `refactor/entity-centric` về `main` theo quyết định owner**. PR #25
`refactor/entity-centric` → `main` là PR đưa cả nhánh tích hợp về main — không phải PR module.

Seed StudioHub hiện có fixture bền `seed-draft-studio` và `seed-draft-studio-group`, bên cạnh 120
listing + 5 group published; seed chạy lặp không tạo bản ghi trùng.

## 2. Tài liệu chi phối (đều trong repo)

| File | Vai trò |
|---|---|
| [`docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md`](../superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md) | **Spec gốc.** §3 style aggregate + style-gate đã ratify, §4 luật cross-cutting, §6 thứ tự 16 PR, §8 các sổ đăng ký (known gap, follow-up, dead code) |
| [`docs/refactor/entity-centric-survey.md`](./entity-centric-survey.md) | **Khảo sát 16 module**: invariant, chỗ đang enforce, rủi ro. Đọc mục của module trước khi viết plan — khỏi khảo sát lại |
| `docs/superpowers/plans/2026-07-2*-entity-refactor-pr*.md` | Plan từng PR đã làm — dùng làm khuôn mẫu |
| [`AGENTS.md`](../../AGENTS.md), [`apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md) | Luật nền của repo |

## 3. Quy trình mỗi module (đã chạy qua PR #7, giữ nguyên)

1. **Khảo sát chính xác bề mặt ghi** — đọc mục module trong `entity-centric-survey.md`, rồi cho một
   agent đọc code thật và trả về: danh sách **từng mã lỗi + status + message nguyên văn**, chữ ký
   port, luồng từng use-case, chỗ nào trong/ngoài `forTenant`, mọi guard SQL/advisory lock, và
   **consumer xuyên module** (bề mặt đóng băng).
2. **Viết plan** vào `docs/superpowers/plans/YYYY-MM-DD-entity-refactor-prN-<module>.md` — có
   Global Constraints (bảng mã lỗi đóng băng + các bẫy), chia 4–5 task, mỗi task có code đầy đủ hoặc
   hướng dẫn phẫu thuật chính xác. Commit plan lên nhánh tích hợp.
3. **Thực thi theo task**: 1 agent implement → tạo review package → 1 agent review (spec + quality)
   → sửa nếu có finding → sang task sau. Ghi sổ sau mỗi task.
4. **Final review toàn nhánh** bằng model mạnh nhất, kèm bằng chứng verify và các minor đã carry.
5. **PR vào `refactor/entity-centric`**, body ghi rõ cả phần **chưa verify được** (đừng tô hồng).

Skill dùng: `superpowers:writing-plans` rồi `superpowers:subagent-driven-development`.

## 4. Luật cứng hay bị vi phạm nhất

- **KHÔNG có test** (ADR 0005). Verify = `typecheck` + `lint` + `build` + **chạy app bấm tay**.
- **CAS ở lại repository.** Mọi write đang guard bằng `WHERE status=…`, advisory lock, unique index,
  GiST… giữ nguyên hình dạng SQL. Entity *phát biểu* rule, repo *thực thi*. Thay bằng
  load-check-save = mở lại race (đây là luật số 1 của spec §3).
- **Wire byte-identical**: mã lỗi + status + **message từng ký tự** + envelope; payload outbox và
  thứ tự emit; response shape.
- **Known gap giữ nguyên** (spec §8a) — phát hiện invariant lỏng thì **ghi sổ**, không siết.
- **Schema đóng băng** — không migration nào trong refactor.
- **Read-side đóng băng** — chỉ refactor write-path.
- Entity framework-free; clock là tham số; `bigint` trong entity, chuỗi số chỉ ở mapper/outbox.

## 5. Bẫy đã trả giá để biết (đừng vấp lại)

1. **`rejectionException` của promotions KHÔNG được đổi sang `DomainError`** —
   `confirm-booking.use-case.ts:80` bắt `err instanceof ConflictException` để nuốt
   `PROMO_LIMIT_REACHED` trên đường late-webhook. Đổi một phía ⇒ tx confirm rollback ⇒ booking đã
   trả tiền không confirm được. Để dành **PR #14 (booking)** khi sửa được cả hai phía.
2. **`forTenant('')` KHÔNG no-op êm** — nó **crash ở phép cast uuid của RLS**. Trước hardening lỗi
   này retry vĩnh viễn; relay hiện park row sau 20 lần lỗi, nhưng handler vẫn phải thay
   `event.tenantId ?? ''` bằng validate-and-skip-with-log (spec §4 bắt buộc) — **skip, không throw**.
3. **Gate đồng thuận phải so với state cũ.** Ở promotions, thiết kế đầu tiên không biểu diễn được
   `fundedBy` nên suýt để tenant đổi funding partner A→B mà **giữ opt-in của A** (chiết khấu ăn
   doanh thu B không đồng thuận). Rule loại này phải nằm trong entity và so với `state` đang lưu.
4. **Handler outbox không được throw vì lý do nghiệp vụ** — relay at-least-once và mỗi event chỉ có
   20 lần thử trước khi bị dead-letter; chỉ lỗi hạ tầng thật sự mới nên tiêu retry budget.
5. **Bất đối xứng cũ đôi khi là hợp đồng**: `end-promotion` short-circuit khi đã ended,
   `end-partner-promotion` ghi vô điều kiện (bump `updatedAt`) — "sửa cho nhất quán" là đổi API.
6. **Subagent đổi branch trong cùng working tree** ⇒ commit doc của controller có thể rơi nhầm nhánh.
   Luôn `git branch --show-current` trước khi commit giữa các task.
7. **Lint rule phải được chứng minh là fire** (tạo vi phạm tạm → chạy lint → thấy lỗi → revert).
   Rule không bao giờ khớp còn tệ hơn không có.

## 6. Môi trường (hay mất thời gian)

- **Node ≥22.22.0**: `.nvmrc` yêu cầu 22.22.0 nhưng máy hiện chỉ cài 22.12.0 và 24.18.0; dùng
  `PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` trước lệnh pnpm để tránh React Router cảnh
  báo engine. Chỉ dùng **pnpm**.
- **Cổng bị project khác chiếm**: 5432 có thể bị container `kaigo-postgres-dev`, 3000 bị
  `cf-connect-be`. **Không đụng container/process của project khác** — smoke chạy API riêng bằng
  `PORT=3001 pnpm --filter=@booking/api dev`, xong thì kill.
- **psql**: `docker compose exec -T postgres psql -U postgres -d booking -c "…"` (kiểm tên user/db
  thật trong docker-compose.yml/.env trước).
- **Mailpit** `localhost:8025` (REST `/api/v1/messages`) để verify email.
- Login seed: customer `customer@studiohub.vn`, tenant owner `owner@studiohub.vn`, partner
  `giang@giangstudio.vn` — mật khẩu `demo-password`; storefront resolve tenant qua `Host: localhost`.
- `turbo.json` hiện hash config ESLint/TypeScript gốc và `packages/config`; vẫn dùng `--force` cho
  final review để chứng minh không dựa vào cache.
- Seed hiện có listing/group draft ổn định (`seed-draft-studio`,
  `seed-draft-studio-group`) cho smoke rule "chỉ target published".
- Discount `percent` do tenant tài trợ dễ chạm guard `PROMO_TENANT_SHARE_NEGATIVE` — smoke nên dùng
  `fixed`.

## 7. Follow-up còn mở và phần đã đóng

Đợt hardening hậu refactor đã đóng các mục có hợp đồng rõ trong spec §8b/§8b-bis/§8c/§8c-bis:

- Relay giới hạn 20 lần thử, dùng DB clock và park bằng `dead_lettered_at`; bốn event lỗi lịch sử
  đã được park, không còn chiếm batch live.
- Migration `20260724120000_entity_post_refactor_hardening` thêm notification `dedupe_key`,
  one-primary-domain partial unique và index claim live. Backstop refund/evidence/dispute đã tồn tại
  trong migration cũ nên không tạo index trùng.
- Promotions không còn import code partner: module sở hữu port + adapter ghi agreement trong cùng
  transaction.
- Moderation listing/group nằm trên aggregate; `ModerationError` là `DomainError`; không còn
  `runModeration` shim.
- Booking pickup/return patch bằng CAS (`status` + marker null), loser trả
  `409 BOOKING_STATE_CHANGED`.
- Mutation tenant-domain swap primary atomically và invalidate positive/negative host cache;
  content-report moderation lấy `handledAt` từ DB clock.
- Draft fixtures, turbo config hashing, reader reason type và dead catalog/contracts đã được dọn.
- Seeded owner/partner permissions đã được xác minh qua HTTP; các ghi chú `MISSING_PERMISSION` cũ là
  trạng thái DB/cache smoke đã stale, không phải thiếu catalog permission.

Vòng quyết định cuối **đã đóng 2026-07-24** theo plan
[`2026-07-24-entity-centric-final-gap-hardening.md`](../superpowers/plans/2026-07-24-entity-centric-final-gap-hardening.md):

- Xoá `SetPlatformRateUseCase` cùng port/repository/request contract không reachable (`59a6e79`);
  không mở thêm route platform chưa có product flow.
- Giữ `targetType` như compatibility alias deprecated, khai báo chính thức trong contract và mapper
  explicit; không còn leak persistence key qua spread (`59a6e79`).
- Một `ICurrentSubscriptionReader` sở hữu tiebreak `starts_at DESC, created_at DESC`, resolve plan và
  DB clock; guard/limits/count/health dùng chung semantics (`29431bb`).
- Gateway credential thành discriminated union, dữ liệu giải mã/payload/evidence được validate,
  query catalog raw cuối cùng được đóng type; dynamic tenant/listing JSON và incoming outbox
  `unknown` là allowlist có chủ đích (`3c38a24`).
- Content-report + listing/group có transition graph và repository CAS; content edit guard
  `updated_at`, moderation guard status, loser trả typed 409 trước audit/outbox (`5c36ba3`).

Các hàng khác còn ghi “giữ nguyên” trong spec §8a vẫn là backlog product riêng; vòng này không tự
phát minh policy cho affiliate/tenant/partner/scheduling/pricing-rule.

## 8. Final review toàn nhánh — 2026-07-24

Final review `main...refactor/entity-centric` sau khi merge đủ 16 module:

- `pnpm turbo lint typecheck build --force`: **28/28 task xanh**, cache 0, Node 24.18.0.
- `pnpm --filter=@booking/api check:rls`: **46/46** tenant-scoped table có FORCE RLS + policy.
- Không có test/test config/test script mới; không đổi Prisma schema/migration, contracts,
  controller hay DTO.
- Mọi `domain/entities`, `domain/value-objects`, `domain/errors` không import Nest/Prisma, không tự
  đọc clock/random/I/O; mỗi `*.use-case.ts` vẫn đúng một exported `XxxUseCase`.
- Finding duy nhất được sửa trong review: listing `review.created` còn truyền tenantId rỗng; giờ đã
  validate-and-skip-with-log. Không còn `event.tenantId ?? ''` hay `forTenant('')` executable.
- Finance final review riêng đã chứng minh repository/release-worker SQL zero-diff, ba bare Nest
  exception bắt buộc, CAS/event order/journal order; smoke dữ liệu thật đã dọn sạch.
- Sau review đầu, đợt hardening đã đóng relay/migration/seed/tooling/promotions/moderation/
  fulfillment/tenant-cache/DB-clock như §7. Final suite hậu hardening bên dưới đã chạy sạch, không
  tái sử dụng kết quả cache của review đầu.

Final review hậu hardening:

- `pnpm turbo lint typecheck build --force`: **28/28 task xanh**, cache 0, Node 24.18.0.
- `pnpm --filter=@booking/api check:rls`: **46/46**; `prisma:deploy`: 29 migration, không pending.
- Toàn bộ 29 migration deploy thành công từ database rỗng tạm; database tạm đã được drop sau verify.
- API boot sạch. Runtime HTTP đã chứng minh moderation listing/group + admin-lock, booking
  fulfillment CAS/replay/concurrency, tenant primary swap + cache invalidation, owner/partner
  permissions và promotions opt-in + agreement adapter; mọi fixture tạm đều được phục hồi/dọn.
- Scan tại mốc này: 257/257 file `*.use-case.ts` có exported `XxxUseCase`; không có
  test/config/script test mới; không còn executable `event.tenantId ?? ''`, `forTenant('')`,
  `runModeration`, hay promotions import partner. Inventory hiện tại là **256/256** vì vòng quyết
  định cuối đã xoá đúng một use-case dead `SetPlatformRateUseCase`; xem §11.

## 9. Audit entity coverage của 257 use-case (baseline trước khi xoá dead code) — 2026-07-24

Audit AST + transitive local-import graph trên đúng 257 file trong `apps/api/src/modules`:

- Trước hardening: 216 đi tới entity/VO/pure domain policy; 41 không đi tới domain.
- 41 file được đọc và phân loại: 27 query/projection thuần; 6 delegate qua store adapter đã dùng
  `Session`/`AuthChallenge`; 2 guarded/set-based repository transition; 1 provider-credential
  boundary validation; 1 read-model projection command; **4 file còn business rule inline**.
- Bốn file đã sửa: finance customer settlement eligibility + payout policy persistence/mapping;
  listing deposit coverage assert + requirement projection.
- Sau hardening: 220/257 đi tới domain policy, trong đó 184 đi tới entity/VO. 37 file còn
  entity-free đều thuộc nhóm orchestration hợp lệ ở trên; không tạo entity giả cho query/CAS/adapter.
- Audit ranh giới kèm theo đã chuyển ba persistence bypass khỏi application: payout settings
  `tx.tenant`, review aggregate raw SQL và booking `tx.partner` lookup đều qua local token/port/
  Prisma adapter. Không còn direct Prisma model/raw SQL trong `modules/*/application/use-cases`.
- Runtime smoke: payout GET/PUT 200; settlement eligible 200 + miss 404 đúng wire; deposit
  requirement 200 + guard 400 đúng message/details; booking create 201; `review.created` projection
  được relay xử lý. Dữ liệu smoke đã phục hồi/dọn sạch.
- Final gate hậu audit: `pnpm turbo lint typecheck build --force` **28/28 task xanh**, cache 0;
  `check:rls` **46/46** tenant-scoped table.

Plan và registry chi tiết:
[`2026-07-24-entity-centric-use-case-audit-hardening.md`](../superpowers/plans/2026-07-24-entity-centric-use-case-audit-hardening.md).

## 10. Deduplicate application error literals — 2026-07-24

Audit AST toàn bộ `modules/*/application/**/*.ts`:

- Baseline có 82 `throw new *Exception`; 77 site mang custom payload và 5 bare Nest exception.
  Ngoài ra có 2 helper trả về custom Nest exception, tổng cộng 79 inline custom construction.
- Sau cleanup: **0 inline custom Nest exception construction**. Năm bare
  `NotFoundException()`/`ConflictException()` được giữ có chủ đích vì đổi sang `DomainError` sẽ đổi
  default Nest body.
- Standard 4xx chuyển sang typed module/shared `DomainError`. Các code dùng xuyên module
  (`BOOKING_NOT_FOUND`, `LISTING_NOT_FOUND`, `LISTING_TYPE_NOT_FOUND`, `PARTNER_NOT_FOUND`,
  `TENANT_NOT_FOUND`, `MODE_NOT_ENABLED`, `CANCELLATION_POLICY_NOT_FOUND`) chỉ còn một definition;
  module cũ re-export alias để giữ import seam.
- Auth retry metadata, legacy body thiếu `statusCode`, webhook/provider error và defensive 500 dùng
  named application HTTP errors, không bị ép thành `DomainError`.
- `DomainError.details` nhận `unknown` để giữ nguyên cả object lẫn array details trên wire.
- Runtime smoke giữ đúng cancellation 404, partner-pricing legacy body, unknown-host 404, bad-webhook
  400, OTP `attemptsRemaining` và resend `retryAfterSec`.
- Final gate tại mốc audit: `pnpm turbo lint typecheck build --force` **28/28 task xanh**, cache 0;
  `check:rls` **46/46**; 257 use-case vẫn đủ, không thêm test. Inventory hiện là 256 sau khi xoá
  `SetPlatformRateUseCase` unreachable theo quyết định ở §7.

Plan:
[`2026-07-24-application-error-deduplication.md`](../superpowers/plans/2026-07-24-application-error-deduplication.md).

## 11. Final-gap review sau rebase — 2026-07-24

- Đã fetch và rebase sạch `refactor/entity-centric` lên `origin/main@a1d6ebf`; nhánh backup trước
  rebase là `codex/backup-entity-centric-pre-rebase-20260724`. Không có conflict.
- Các quyết định owner nêu ở §7 đã implement trong `59a6e79`..`5c36ba3`; named boundary pipes ở
  `56723cf`, docs/conventions ở `bd7961a`.
- Latest `main` mang test trở lại trái ADR 0005; `5e90e30` đã bỏ toàn bộ executable test,
  test script/task và CI test step vừa rebase vào. Repo hiện lại đúng no-tests policy.
- Final static review phát hiện hai cross-tenant query còn nằm trực tiếp trong
  `GetPlatformHealthUseCase` và `GetPlatformFinanceUseCase`; `9856a53` chuyển nguyên SQL sang local
  read port/Prisma adapter. `bf4993c` bỏ nốt Prisma enum import khỏi application use-case.
- Inventory hiện tại: **256/256** file `*.use-case.ts` có đúng exported `XxxUseCase`; không use-case
  nào inject `PrismaService`, import `@prisma/client`, gọi raw SQL hoặc import infrastructure.
  Không có application service, inline structured Nest error hay empty-tenant fallback.
- `pnpm turbo lint typecheck build --force`: **28/28 task xanh**, cache 0; RLS:
  **46/46**. `prisma:deploy` thấy 29 migration và không có migration pending.
- API boot sạch trên port 3001; `/health`, `/health/ready`, `/public/tenant`,
  `/platform/health`, `/platform/finance` đều 200. Runtime guard giữ data nguyên trạng:
  `dismissed → reviewing` trả `409 CONTENT_REPORT_INVALID_TRANSITION`, draft listing hide trả
  `400 LISTING_NOT_HIDEABLE`; response content-report phát cả `target` và `targetType`.

Không còn action kỹ thuật nào trong scope final-gap này. Các hàng chưa đóng trong spec §8a vẫn là
backlog behavior/product độc lập; bước tiếp theo là final integration/PR vào `main`.

## 12. Nếu bạn là AI tiếp quản

Nói với người dùng bạn đã đọc file này, xác nhận lại §1 (trạng thái) bằng
`git log --oneline -5 refactor/entity-centric` + `gh pr list`. Nếu có PR module đang mở, tiếp tục
review/sửa/merge PR đó; chỉ bắt đầu từ §3 bước 1 cho module kế tiếp khi không còn PR module mở. Đừng
khảo sát lại toàn bộ API — `entity-centric-survey.md` đã có sẵn.
