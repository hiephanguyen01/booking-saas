# Bàn giao — Entity-centric refactor `apps/api`

> Đọc file này **đầu tiên** nếu bạn (người hoặc AI) tiếp quản công việc refactor này trên một máy
> khác / một phiên khác. Cập nhật lần cuối: **2026-07-24**, trong PR #16.

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
| 16 | administrative-division | 🔍 final review đạt (branch `refactor/entity-administrative-division`, sẵn sàng merge) |

**listing tách 3 PR con** (module lớn nhất: 45 use-case, 56 endpoint) — ✅ cả 3 merged (PR
#29/#30/#31). Scheduling đã merge ở PR #32; payments, booking và finance cũng đã merge local vào
integration: **15/16 module đã nằm trên integration**, administrative-division đã qua final review
và là module cuối cùng chờ merge.

Booking #14 đã đưa lifecycle qua aggregate, giữ CAS/GiST/second-tx và sửa đồng bộ
`rejectionException` promotions↔booking. Finance #15 đã đưa CommissionRule/Settlement/Payout/
SettlementDispute/LedgerJournal/PayoutPolicy về entity-centric, giữ nguyên repository SQL,
DB-clock/CAS, FIFO allocation và event order; finance outbox cũng đã normalize tenantId.
Administrative-division #16 đã đưa membership province↔ward về immutable `AdministrativeAddress`,
giữ resolver signature, tx-less global catalog và cache 24h. Việc kế tiếp sau merge module cuối:
**final review toàn nhánh `refactor/entity-centric`**. **Bộ máy moderation (`listing-moderation.ts` +
`moderation-support.ts`) đã dùng chung listing↔group và cả 2 PR CỐ Ý không đụng** (spec §8b-bis) —
sau khi các module còn lại xong, một PR hợp nhất riêng có thể promote `ModerationError`→`DomainError`
+ đưa transition thành method trên entity (bỏ shim `runModeration`); wire giữ byte-identical. (PR #25
`refactor/entity-centric` → `main` đang mở là PR đưa cả nhánh tích hợp về main — không phải PR module.)

Ghi chú fixture seed: smoke #11a **tự tạo** listing/pricing draft trong tx thay vì thêm fixture seed
(quyết định owner 2026-07-24). Việc thêm fixture `status='draft'` vào seed (spec §8c-bis mục 2) vẫn
còn treo cho các đợt sau nếu cần dữ liệu bền.

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
2. **`forTenant('')` KHÔNG no-op êm** — nó **crash ở phép cast uuid của RLS** và làm kẹt event trong
   retry vĩnh viễn (relay không có dead-letter). Khi PR đụng file đăng ký outbox của module thì thay
   `event.tenantId ?? ''` bằng validate-and-skip-with-log (spec §4 bắt buộc) — **skip, không throw**.
3. **Gate đồng thuận phải so với state cũ.** Ở promotions, thiết kế đầu tiên không biểu diễn được
   `fundedBy` nên suýt để tenant đổi funding partner A→B mà **giữ opt-in của A** (chiết khấu ăn
   doanh thu B không đồng thuận). Rule loại này phải nằm trong entity và so với `state` đang lưu.
4. **Handler outbox không được throw vì lý do nghiệp vụ** — relay at-least-once, không dead-letter.
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
- **`turbo` không hash `eslint.config.mjs` gốc** ⇒ đổi rule lint xong chạy `pnpm turbo lint` có thể
  trúng cache và **xanh giả**; dùng `--force` khi cần chắc.
- Seed **không có** listing/group `status <> 'published'` ⇒ smoke rule "chỉ target published" phải
  thay bằng id không tồn tại (spec §8c-bis đã ghi việc thêm fixture `draft`).
- Discount `percent` do tenant tài trợ dễ chạm guard `PROMO_TENANT_SHARE_NEGATIVE` — smoke nên dùng
  `fixed`.

## 7. Nợ kỹ thuật đang mở (spec §8b, §8b-bis, §8c-bis)

Đọc spec để có bản đầy đủ; các mục đáng chú ý:

- **Relay outbox thiếu dead-letter/max-attempts** — một row hỏng vĩnh viễn chiếm claim slot mãi mãi.
  Nên làm PR hạ tầng riêng, độc lập với các đợt refactor.
- `event.tenantId ?? ''` chỉ còn ở **listing** — finance đã normalize ở PR #15; scheduling,
  payments và booking đã normalize ở PR #12/#13/#14. Listing đã refactor xong nhưng 3 PR con không
  đụng file đăng ký outbox nên pattern còn đó; xử lý ở PR follow-up khi chạm wiring.
- Wave migration sau refactor: unique index còn thiếu (dedupe_key của notification, refunds,
  dispute, one-primary-domain).
- Thêm fixture `draft` vào seed trước PR #9/#11.
- `rejectionException` đã hợp nhất vào `PromoRejectionError` ở PR #14; confirm chỉ nuốt đúng
  `PROMO_LIMIT_REACHED`, wire `message === code` giữ nguyên.
- promotions import chéo module partner (`AGREEMENT_REPOSITORY`) — vi phạm ADR 0003 có sẵn, sửa ở PR
  độc lập.
- Booking return vẫn giữ choreography legacy `patchFulfillment` không guard status rồi dùng status
  re-read làm nguồn CAS; đổi sang guarded patch/version cần migration/concurrency PR riêng.
- Smoke #14: seeded `giang@…` và `owner@…` đăng nhập được nhưng các endpoint partner/tenant booking
  trả `MISSING_PERMISSION`; vì vậy partner complete/pick-up/return/no-show/ownership chưa smoke qua
  HTTP. Public create/idempotency/GiST/confirm-replay/guest-cancel/promo-error đã smoke và dọn sạch.
- Smoke #15: API boot/health đạt; owner login được nhưng endpoint commission trả
  `MISSING_PERMISSION: tenant.commissions.manage`. Vì vậy finance write-flow được chạy trực tiếp qua
  use-case với RLS transaction thật: commission create/update/delete + floor guard; settlement
  completion/no-show/cancellation/refund/finalize + release idempotency; payout guards; dispute
  open/respond/resolve-release. Tất cả fixture/rule/refund/dispute tạo tạm đã dọn và custody state
  được khôi phục. Khi boot, relay vẫn thấy các `booking.completed` cũ đã retry hàng trăm lần — bằng
  chứng thực tế cho nợ dead-letter ở trên, không phải regression của PR #15.
- Smoke #16: API boot đạt; `GET /public/administrative-divisions/{provinces,wards}` trả 200, đúng
  shape và `Cache-Control: public, max-age=86400`. Resolver chạy với catalog thật: cặp `01/00004`
  hợp lệ; cặp ward thật gắn sang province `04` và ward `99999` đều trả đúng
  `400 INVALID_ADMINISTRATIVE_DIVISION`.

## 8. Nếu bạn là AI tiếp quản

Nói với người dùng bạn đã đọc file này, xác nhận lại §1 (trạng thái) bằng
`git log --oneline -5 refactor/entity-centric` + `gh pr list`. Nếu có PR module đang mở, tiếp tục
review/sửa/merge PR đó; chỉ bắt đầu từ §3 bước 1 cho module kế tiếp khi không còn PR module mở. Đừng
khảo sát lại toàn bộ API — `entity-centric-survey.md` đã có sẵn.
