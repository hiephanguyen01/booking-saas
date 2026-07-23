# Bàn giao — Entity-centric refactor `apps/api`

> Đọc file này **đầu tiên** nếu bạn (người hoặc AI) tiếp quản công việc refactor này trên một máy
> khác / một phiên khác. Cập nhật lần cuối: **2026-07-24**, trong PR #8.

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
| 8 | partner | 🔍 review (GitHub PR #24) |
| 9→16 | catalog → tenancy → listing → scheduling → payments → booking → finance → administrative-division | chưa làm |

**Đang mở:** **PR #8 — module partner** ([GitHub PR #24](https://github.com/vnkduy/booking-saas/pull/24)).
Không bắt đầu PR #9 trước khi PR này được review và merge vào `refactor/entity-centric`.

Gợi ý riêng cho partner (từ khảo sát): một aggregate `Partner` với hai lifecycle độc lập
(`status` + `verificationStatus`); `AgreementAcceptance` vẫn là append-only record. Giữ nguyên
commit-then-throw khi reject identity, `SELECT … FOR UPDATE`, SQL future confirmed booking dùng DB
`now()`, write JSONB theo từng cột, cache invalidation sau commit, và đường import
`assertCanServeListingType`/`PARTNER_REPOSITORY` mà listing đang dùng. Promotions vẫn import chéo
agreement port + concrete repository — nợ ADR có sẵn, không sửa trong refactor. Plan:
`docs/superpowers/plans/2026-07-23-entity-refactor-pr8-partner.md`.

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

- **Node 22.22.0**: `source ~/.nvm/nvm.sh && nvm use` trước mọi lệnh pnpm. Chỉ dùng **pnpm**.
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
- `event.tenantId ?? ''` còn ở **booking, finance, listing, payments, scheduling** — sẽ tự
  hết khi từng module refactor (spec §4), không cần quét riêng.
- Wave migration sau refactor: unique index còn thiếu (dedupe_key của notification, refunds,
  dispute, one-primary-domain).
- Thêm fixture `draft` vào seed trước PR #9/#11.
- `rejectionException` hợp nhất vào `DomainError` — để PR #14.
- promotions import chéo module partner (`AGREEMENT_REPOSITORY`) — vi phạm ADR 0003 có sẵn, sửa ở PR
  độc lập.

## 8. Nếu bạn là AI tiếp quản

Nói với người dùng bạn đã đọc file này, xác nhận lại §1 (trạng thái) bằng
`git log --oneline -5 refactor/entity-centric` + `gh pr list`, rồi bắt đầu từ §3 bước 1 cho module kế
tiếp. Đừng khảo sát lại toàn bộ API — `entity-centric-survey.md` đã có sẵn.
