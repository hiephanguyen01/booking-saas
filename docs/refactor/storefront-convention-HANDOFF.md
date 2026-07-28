# Bàn giao — Storefront refactor theo convention `apps/dashboard`

**Nhánh:** `refactor/storefront-dashboard-convention`
**Ngày:** 2026-07-28 · **Trạng thái:** Phase 1–3 xong (29 commit), Phase 4–13 chưa làm
**Plan đầy đủ:** [`docs/superpowers/plans/2026-07-28-storefront-dashboard-convention-refactor.md`](../superpowers/plans/2026-07-28-storefront-dashboard-convention-refactor.md)

---

## 1. Vì sao có cuộc refactor này

Audit `apps/storefront` (364 file TS/TSX, ~30.1k LOC) ngày 2026-07-28. Code **không bẩn kiểu cẩu thả** —
0 `any`, 0 `@ts-ignore`, 0 `eslint-disable`, 0 `TODO/FIXME`, 0 test rác, lint + security gate xanh. Nó bẩn
kiểu **thiếu hàng rào**: `eslint.config.mjs` chỉ có boundary rule cho `apps/api`, frontend không có gì, nên
4 bucket top-level ăn lẫn nhau và các primitive dùng chung bị copy 2–3 lần rồi drift.

12 nhóm phát hiện, xếp theo thứ tự sửa trong plan:

| # | Vấn đề | Phase | Xong? |
| --- | --- | --- | --- |
| 1 | 4 bucket chồng chéo, 10 import ngược `features → routes`, 6 leak `templates → features`, 7 leak `layouts → features` | 2–5 | 🟡 cấu trúc xong, hàng rào chưa |
| 2 | 3 implementation song song cho "chọn ngày → chọn slot → quote" (~2.6k LOC) | 6 | ❌ |
| 3 | 2 dialog shell copy gần nguyên, khác nhau ở SSR/hydration | 6 | ❌ |
| 4 | 3 page shell copy tay và đã drift | 7 | ❌ |
| 5 | `routes/` không đồng nhất — `bookings.tsx` 235 dòng chứa cả UI | 8 | ❌ |
| 6 | i18n bypass — 20 chuỗi hardcode dù có sẵn 10 namespace | 9 | ❌ |
| 7 | `params.locale === 'en' ? 'en' : 'vi'` lặp 27 lần / 18 file | 10 | ❌ |
| 8 | Dead code: 1 component + controller, 39 i18n key mồ côi × 2 locale | 11 | ❌ |
| 9 | Mock data trong production path (`/account/messages` 100% giả) | 11 | ❌ |
| 10 | God file `platform-sections.tsx` 721 dòng | 12 | ❌ |
| 11 | `features/` shape không đồng nhất | 3 | ✅ |
| 12 | ESLint thiếu `eslint-plugin-react-hooks` | 5 | ❌ |

---

## 2. Đã làm gì (Phase 1–3)

`322 files changed, 2402 insertions(+), 1319 deletions(-)` so với `main`. **Không một dòng UI nào đổi** —
toàn bộ là di chuyển file + nối lại import.

### Phase 1 — alias `~/` (`13a09517` → `6429154b`)

- `apps/storefront/tsconfig.json` + `vite.config.ts` nhận `~/*` → `./app/*`, copy đúng shape của dashboard.
- Codemod rewrite **1166 import**: mọi specifier bắt đầu bằng `../` thành `~/`; `./sibling` giữ nguyên.
- Sửa `apps/storefront/CLAUDE.md` — doc cũ nói *"the `~/` alias is declared in tsconfig"*, **sai**, tsconfig
  khi đó không hề có `paths`.

### Phase 2 — dồn về 6 bucket của dashboard (`7ef847b6` → `7675ab99`)

`app/` trước có 9 bucket, giờ đúng 6 + 4 file gốc:

```
app/  routes/ features/ components/ constants/ hooks/ lib/
      root.tsx routes.ts app.css entry.server.tsx
```

| Từ | Về |
| --- | --- |
| `theme/theme.ts` | `lib/theme.ts` |
| `lib/locale-paths.ts` | `constants/paths.ts` |
| 4 hook trong `lib/` | `hooks/` |
| `templates/studio/home*` + hero/carousel/tabs/sections | `features/home/{components,lib,server}/` |
| `templates/studio/booking-panel*` | `features/booking-widget/components/` |
| `templates/index.ts` | `features/home/lib/home-template.ts` |
| `layouts/site-*`, `tenant-brand` | `features/site-shell/components/` |
| `layouts/account-flow-layout.tsx` | `features/account/components/` |
| 5 primitive trong `listing-group/components/` | `components/` |

`homeTemplateFor` cũ nhận `_vertical` rồi bỏ luôn tham số — giờ là `switch (vertical)` thật, hành vi
không đổi (mọi vertical vẫn trả `StudioHome`) nhưng seam Phase 2/3 không còn nói dối.

### Phase 3 — chuẩn hoá `features/<name>/{components,server,lib}` (`862e00ad` → `4390dcb1`)

21 feature, **mọi thư mục cấp 2 giờ chỉ là `components` / `server` / `lib`** — khớp dashboard 1:1.

- `packages/` (14 file phẳng) và `search/` (9 file phẳng) → tách components/lib.
- 13 feature còn lại, mỗi feature một commit. `platform-landing` vốn đã đúng — no-op.
- Xoá `features/auth/auth-ui.tsx` (chỉ là `export * from './ui'`), `ui/` → `components/`.
- **Task 3.4** — đưa `lib/*.server.ts` có đúng một chủ về feature. Phân loại bằng grep consumer thật, chỉ
  **3/34** file di chuyển:

  | File | Consumer | Về |
  | --- | --- | --- |
  | `auth-routes.server.ts` (266 dòng) | 10 route `routes/auth/*` | `features/auth/server/` |
  | `checkout-idempotency.server.ts` | duy nhất `checkout-route.server.ts` | `features/checkout/server/` |
  | `listing-booking-data.server.ts` | duy nhất 2 route booking-data | `features/booking-widget/server/` |

  **31 file ở lại `lib/`** vì hoặc là hạ tầng (dashboard cũng để `lib/`), hoặc ≥2 feature dùng — kéo chúng
  vào một feature sẽ chế ra đúng loại import chéo mà Phase 5 dựng hàng rào để cấm. Nặng nhất:
  `catalog.server` (**7 feature**), `booking.server` (5), `affiliate.server` / `payment-redirect.server` /
  `public-reviews.server` (3).
- **Task 3.5** — làm phẳng 11 thư mục sub-feature (`account/{bookings,favorites,messages,profile,recent,reviews}`,
  `partner-onboarding/{done,password,profile,start,verify}`). Xem §4 để biết vì sao task này sinh ra muộn.

---

## 3. Trạng thái xác minh

Chạy sau **mỗi** commit, và lần cuối trên `4390dcb1`:

```bash
nvm use                                                    # .nvmrc = 22.22.0
pnpm turbo typecheck build --filter=@booking/storefront...  # 10/10 successful
pnpm --filter=@booking/storefront lint                      # clean
pnpm --filter=@booking/storefront security                  # passed
```

Ba bất biến cấu trúc, kiểm bằng tay ngày 2026-07-28 — **cả ba đều pass**:

```bash
find apps/storefront/app/features -mindepth 2 -maxdepth 2 -type d \
  | grep -vE '/(components|server|lib)$'                         # rỗng
find apps/storefront/app/features -name '*.server.ts' | grep -v '/server/'   # rỗng
cd apps/storefront/app && grep -rn "from '\.\./" . --include='*.ts' --include='*.tsx' \
  | grep -v '+types'                                             # rỗng
```

---

## 4. Bẫy đã dẫm phải — đọc trước khi làm tiếp

1. **`pnpm --filter=@booking/storefront typecheck` chạy một mình sẽ NÓI DỐI.** Nó dựng type từ `dist/` cũ
   của `@booking/contracts` + `@booking/i18n` và báo **17 lỗi giả** (`NsI18n.Platform`,
   `PublicListingDetailWithTimezoneResponse`, `resourceTimezone`…). Luôn dùng
   `pnpm turbo typecheck build --filter=@booking/storefront...` — **dấu `...` cuối là bắt buộc**.
2. **Shell mặc định Node v20.19.4**, `.nvmrc` = 22.22.0. React Router 8 in "Oops" rồi bail. `nvm use` trước
   mọi lệnh pnpm.
3. **`./+types/*` KHÔNG resolve qua `~/`.** Nó chỉ resolve qua thủ thuật `rootDirs` trong tsconfig, tức
   phải là đường dẫn tương đối. Hiện còn **10 file** dưới `features/` import `routes/+types/*` bằng `../`
   — đó là ngoại lệ cố ý, không phải nợ. **Phase 4 xoá sạch chúng.** Khi move file, phải tự tính lại độ
   sâu `../` cho mấy import này.
4. **`pnpm format` trần reformat ~250 file ngoài storefront** (apps/api, dashboard, packages, cả
   `.vscode/mcp.json`). Luôn dùng `pnpm exec prettier --write apps/storefront/app`.
5. **`git mv` tự stage.** Khi làm nhiều `git mv` rồi commit từng nhóm, `git commit` sẽ nuốt luôn nhóm sau.
   Dùng `git commit -- <đường dẫn>` hoặc `git restore --staged` trước khi commit.
6. **Lỗi trong plan gốc, đã sửa:** Phase 3.3 ghi *"`features/account` — đã đúng"*. Sai — nó có đủ
   `{components,server,lib}` **nhưng còn 6 thư mục con nữa**, `partner-onboarding` còn 5. Reviewer cho qua
   vì tin dòng đó trong brief. Bắt được nhờ đối chiếu với bất biến của gate Phase 5.3. Bài học: **khi brief
   và ràng buộc cấu trúc đá nhau, ràng buộc thắng** — và người quyết là chủ dự án, không phải reviewer.

---

## 5. Làm tiếp thế nào

### Thứ tự KHÔNG được đảo

- Phase 4 (cắt `features → routes`) **phải trước** Phase 5 (bật rule). Bật rule khi còn 10 vi phạm thì lint
  đỏ hàng loạt, không phân biệt được lỗi mới với nợ cũ.
- Phase 5 (hàng rào) nên trước 6–12, để mọi phase sau tự động được canh.
- `check:frontend-structure` chỉ nối vào CI ở **Phase 8**, vì bất biến "route ≤ 120 dòng" còn đỏ 3 chỗ
  (`routes/bookings.tsx` 235 dòng, `community.tsx`, `account/help.tsx`) cho tới lúc đó.

### Quyết định đã chốt với chủ dự án (đừng hỏi lại)

- **Phase 7** — DUYỆT gộp 3 page shell, chấp nhận 3 thay đổi pixel ở **trang packages**:
  `bg-muted/40`→`/30`, `py-6`→`py-4`, `MapPin size-5`→`size-4`. Landmark `<main>` áp cho cả 3 trang.
- **Phase 11.2** — DUYỆT gỡ sạch mock. `accountMocksEnabled()` = `!production` nên **UI production không
  đổi**; chỉ dev mất dữ liệu giả, đó là mục tiêu. Xoá `mock-data.server.ts`,
  `account-listings.server.ts`, toàn bộ UI chat của `/account/messages`;
  `MockDisabledState` → `FeatureUnavailableState`.
- **Phase 6.1** — dialog shell dùng **CSS-branch** (`hidden lg:block`) làm chuẩn, không dùng JS `isDesktop`
  (SSR-đúng, không nháy sau hydrate). Nếu chạy thử thấy dialog packages **đổi hình** thì dừng và hỏi.
- **Task 3.4** — không ép module server dùng chung xuống một feature (xem §2).

### Quy trình đang dùng

Đang chạy bằng skill `superpowers:subagent-driven-development`: mỗi phase một implementer subagent, một
reviewer sau đó, ledger ghi tiến độ.

- **Workspace:** `.superpowers/sdd/2026-07-28-storefront-dashboard-convention-refactor/` (git-ignored)
  - `progress.md` — ledger, **đọc file này trước tiên** khi quay lại
  - `task-N-brief.md` — brief đã trích cho từng phase
  - `task-N-report.md` — report của implementer
  - `review-*.diff` — review package
- **Brief cho Phase 4 đã trích sẵn:** `task-4-brief.md`
- Trích brief cho phase kế: lấy `## Global Constraints` + đoạn `# Phase N —` của file plan.

### Việc đầu tiên hôm sau

Phase 4 — cắt đứt `features/ → routes/`, 3 task:

1. **4.1** — bỏ `routes/+types` khỏi 10 file `features/`; thay bằng kiểu tự khai suy từ module server của
   chính feature (plan có mẫu đầy đủ cho `catalog-page.tsx`).
2. **4.2** — xoá shim `routes/partner-onboarding/shared.tsx` (`export *` ngược), trỏ thẳng vào feature.
3. **4.3** — nuốt thân loader của 2 route booking-data vào
   `features/booking-widget/server/listing-booking-data.server.ts` (file đã nằm sẵn ở đó từ Task 3.4).

Xong 4.3 thì lệnh này phải rỗng — đó là điều kiện để sang Phase 5:

```bash
cd apps/storefront/app && grep -rn "~/routes/\|routes/+types" features components
```

---

## 6. Prompt bàn giao (dán nguyên văn cho agent tiếp theo)

````text
Tiếp tục một cuộc refactor đang dở trong monorepo tại `/Volumes/OVEN Duy/temp/booking-saas`.

## Trạng thái

Nhánh `refactor/storefront-dashboard-convention` (đã push origin), HEAD = `c1b5e657`.
Mục tiêu tổng: đưa `apps/storefront` về đúng convention của `apps/dashboard`, chia 13 phase.
**Phase 1–3 đã xong và đã review. Phase 4–13 chưa làm.** Việc của bạn: làm tiếp từ Phase 4.

## Đọc trước khi gõ bất cứ thứ gì

1. `docs/refactor/storefront-convention-HANDOFF.md` — bàn giao đầy đủ, đọc HẾT.
2. `docs/superpowers/plans/2026-07-28-storefront-dashboard-convention-refactor.md` — plan 13 phase,
   đọc `## Global Constraints` + phase bạn sắp làm. Đừng đọc cả file mỗi lần.
3. `AGENTS.md` và `apps/storefront/CLAUDE.md` — luật chung của repo.

Nếu máy này còn thư mục `.superpowers/sdd/2026-07-28-storefront-dashboard-convention-refactor/`
thì đọc `progress.md` trong đó (ledger tiến độ) và dùng `task-4-brief.md` đã trích sẵn.
Thư mục này git-ignored — máy khác sẽ không có, lúc đó handoff doc là nguồn duy nhất.

## Luật cứng — vi phạm là hỏng việc

1. **KHÔNG BAO GIỜ TẠO TEST.** ADR 0005. Không `*.spec.*`, không `*.test.*`, không vitest/jest/
   playwright, không script `test`, không step test trong CI. Kể cả khi thấy "nên có test ở đây".
2. **KHÔNG ĐỔI UI.** Không sửa className, không sửa cấu trúc DOM, không sửa chữ. Ngoại lệ DUY NHẤT
   đã được chủ dự án duyệt: 3 thay đổi pixel ở trang packages trong Phase 7 (ghi rõ trong plan).
3. **KHÔNG đổi schema, KHÔNG đụng `@booking/contracts`, KHÔNG đụng `apps/api`.**
4. **KHÔNG đổi hành vi runtime** — loader/action contract, URL, thứ tự fetch giữ nguyên.
5. **Mỗi task một commit nhỏ.** Không gộp nhiều feature vào một commit.

## Lệnh verify — dùng SAI là bạn sẽ đuổi theo lỗi ma

```bash
nvm use    # .nvmrc = 22.22.0; shell mặc định là Node 20, React Router 8 sẽ bail
pnpm turbo typecheck build --filter=@booking/storefront...   # DẤU ... CUỐI LÀ BẮT BUỘC
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront security
```

⚠️ **`pnpm --filter=@booking/storefront typecheck` chạy MỘT MÌNH sẽ báo 17 lỗi GIẢ**
(`NsI18n.Platform`, `PublicListingDetailWithTimezoneResponse`, `resourceTimezone`…). Nguyên nhân là
`dist/` cũ của `@booking/contracts` + `@booking/i18n`, không phải lỗi code. Đừng "sửa" chúng.

Chạy verify **sau mỗi commit**, không phải chỉ ở cuối.

## 4 cái bẫy đã có người dẫm

1. **`./+types/*` KHÔNG resolve qua alias `~/`** — chỉ qua thủ thuật `rootDirs` trong tsconfig, tức
   bắt buộc là đường dẫn tương đối. Hiện còn 10 file dưới `features/` import `routes/+types/*` bằng
   `../` — **cố ý, không phải nợ**. Phase 4 xoá sạch chúng. Khi move file, tự tính lại độ sâu `../`.
2. **`pnpm format` trần reformat ~250 file NGOÀI storefront** (apps/api, dashboard, packages, cả
   `.vscode/mcp.json`). Luôn dùng `pnpm exec prettier --write apps/storefront/app`.
3. **`git mv` tự stage.** Làm nhiều `git mv` rồi commit từng nhóm thì `git commit` nuốt luôn nhóm sau.
   Dùng `git commit -- <đường dẫn>` hoặc `git restore --staged` trước.
4. **Alias `~/` cho mọi đường dẫn vượt cấp, `./sibling` giữ tương đối.** Sau mỗi lần move, lệnh này
   phải rỗng: `cd apps/storefront/app && grep -rn "from '\.\./" . --include='*.ts' --include='*.tsx' | grep -v '+types'`

## Quyết định chủ dự án đã chốt — ĐỪNG HỎI LẠI, ĐỪNG TỰ ĐỔI

- **Phase 6.1** — dialog shell dùng CSS-branch (`hidden lg:block`) làm chuẩn, KHÔNG dùng JS `isDesktop`.
- **Phase 7** — DUYỆT gộp 3 page shell, chấp nhận 3 thay đổi pixel ở trang packages:
  `bg-muted/40`→`/30`, `py-6`→`py-4`, `MapPin size-5`→`size-4`. Landmark `<main>` cho cả 3 trang.
- **Phase 11.2** — DUYỆT gỡ SẠCH mock. UI production không đổi (mock vốn tắt ở production).
- **Task 3.4** — 31 file `lib/*.server.ts` ở lại `lib/` là CỐ Ý (hạ tầng hoặc ≥2 feature dùng).
  Đừng kéo chúng vào feature: làm thế là tự chế ra đúng loại import chéo mà Phase 5 dựng rào để cấm.

## Thứ tự KHÔNG được đảo

Phase 4 (cắt `features→routes`) **phải trước** Phase 5 (bật rule ESLint). Bật rule khi còn 10 vi phạm
thì lint đỏ hàng loạt và không phân biệt được lỗi mới với nợ cũ.
`check:frontend-structure` chỉ nối vào CI ở **Phase 8**, vì bất biến "route ≤120 dòng" còn đỏ 3 chỗ
cho tới lúc đó.

## Bắt đầu thế nào

**Bước 0 — xác nhận baseline chưa hỏng.** Chạy 3 lệnh verify ở trên + 3 lệnh dưới đây; TẤT CẢ phải
sạch. Nếu có cái nào đỏ, DỪNG và báo người dùng — bạn đã nhận một cây code hỏng, đừng chồng thêm lên.

```bash
find apps/storefront/app/features -mindepth 2 -maxdepth 2 -type d | grep -vE '/(components|server|lib)$'
find apps/storefront/app/features -name '*.server.ts' | grep -v '/server/'
cd apps/storefront/app && grep -rn "from '\.\./" . --include='*.ts' --include='*.tsx' | grep -v '+types'
```

**Bước 1 — làm Phase 4**, 3 task, mỗi task một commit, verify giữa từng cái:
- 4.1 bỏ `routes/+types` khỏi 10 file trong `features/`, thay bằng kiểu tự khai suy từ module server
  của chính feature (plan có mẫu đầy đủ cho `catalog-page.tsx`).
- 4.2 xoá shim `routes/partner-onboarding/shared.tsx`, trỏ thẳng vào feature.
- 4.3 nuốt thân loader 2 route booking-data vào
  `features/booking-widget/server/listing-booking-data.server.ts` (file đã nằm sẵn ở đó).

Điều kiện xong Phase 4 — lệnh này phải rỗng:
```bash
cd apps/storefront/app && grep -rn "~/routes/\|routes/+types" features components
```

**Bước 2** — cập nhật ledger (nếu có) và tiếp Phase 5.

## Khi bạn thấy plan có vẻ sai

Plan này ĐÃ sai 2 lần và cả 2 lần đều được bắt bằng cách đối chiếu với ràng buộc cấu trúc, không phải
bằng cách tin brief. Nếu bạn thấy một dòng trong plan mâu thuẫn với convention của dashboard hoặc với
bất biến của `check:frontend-structure`: **DỪNG, trình bày cả hai bên cho người dùng, hỏi cái nào
thắng.** Đừng tự chọn, đừng im lặng làm theo plan, đừng im lặng làm ngược plan.

Tương tự: đừng mở rộng phạm vi. Nếu thấy thứ đáng sửa mà không nằm trong 13 phase, ghi lại và báo,
đừng sửa luôn.
````
