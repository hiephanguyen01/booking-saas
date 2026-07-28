# Bàn giao — Storefront refactor theo convention `apps/dashboard`

**Nhánh:** `refactor/storefront-dashboard-convention`
**Ngày:** 2026-07-28 · **Trạng thái:** Phase 1–5 xong; Phase 3 và Phase 8 scope đã bổ sung theo review
của chủ dự án; Phase 6–13 chưa làm
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
| 1 | 4 bucket chồng chéo, 20 import `+types` + các import ngược khác `features → routes`, 6 leak `templates → features`, 7 leak `layouts → features` | 2–5 | ✅ |
| 2 | 3 implementation song song cho "chọn ngày → chọn slot → quote" (~2.6k LOC) | 6 | ❌ |
| 3 | 2 dialog shell copy gần nguyên, khác nhau ở SSR/hydration | 6 | ❌ |
| 4 | 3 page shell copy tay và đã drift | 7 | ❌ |
| 5 | `routes/` không đồng nhất — `bookings.tsx` 236 dòng chứa cả UI | 8 | ❌ |
| 6 | i18n bypass — 20 chuỗi hardcode dù có sẵn 10 namespace | 9 | ❌ |
| 7 | `params.locale === 'en' ? 'en' : 'vi'` lặp 27 lần / 18 file | 10 | ❌ |
| 8 | Dead code: 1 component + controller, 39 i18n key mồ côi × 2 locale | 11 | ❌ |
| 9 | Mock data trong production path (`/account/messages` 100% giả) | 11 | ❌ |
| 10 | God file `platform-sections.tsx` 721 dòng | 12 | ❌ |
| 11 | `features/` shape không đồng nhất | 3 | ✅ |
| 12 | ESLint thiếu `eslint-plugin-react-hooks` | 5 | ✅ |

Audit bổ sung `routes/` sau Phase 4: 65 file route, 10 file chứa 21 top-level support declaration,
1 support module không phải route (`legacy/redirect.server.ts`) và 11 import route→route ngoài
`+types`. Phase 8 cũ chỉ liệt kê 3 route béo nên đã được mở rộng; xem quyết định ở §5.

---

## 2. Đã làm gì (Phase 1–5)

Phase 1–4 chỉ thay đổi ranh giới module, vị trí file, import và kiểu dữ liệu; không chủ ý đổi UI,
loader/action contract hay URL.

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

### Phase 3 — chuẩn hoá `features/<name>/{components,hooks,server,lib}` (`862e00ad` → hiện tại)

21 feature, **mọi thư mục cấp 2 giờ chỉ là `components` / `hooks` / `server` / `lib`**. `hooks/` là
quyết định bổ sung của chủ dự án sau review: controller hook feature-local không được nằm trong
`components/`.

- `packages/` (14 file phẳng) và `search/` (9 file phẳng) → tách components/lib.
- 13 feature còn lại, mỗi feature một commit. `platform-landing` vốn đã đúng — no-op.
- Xoá `features/auth/auth-ui.tsx` (chỉ là `export * from './ui'`), `ui/` → `components/`.
- **Task 3.4 ban đầu** đưa 3 server module single-owner về feature:

  | File | Consumer | Về |
  | --- | --- | --- |
  | `auth-routes.server.ts` (266 dòng) | 10 route `routes/auth/*` | `features/auth/server/` |
  | `checkout-idempotency.server.ts` | duy nhất `checkout-route.server.ts` | `features/checkout/server/` |
  | `listing-booking-data.server.ts` | duy nhất 2 route booking-data | `features/booking-widget/server/` |

  Review sau đó chốt lại ranh giới: shared **không đồng nghĩa hạ tầng**. Thêm 9 BFF/domain module đã rời
  `app/lib` về owner feature: `affiliate`, `auth-flow`, `booking`, `catalog`, `checkout-flow`,
  `partner`, `payment-redirect`, `public-reviews`, `recent`. `app/lib` hiện còn 22 `*.server.ts`, chỉ là
  hạ tầng/shared request concern (API, session/auth context, Redis, env, request parsing/security,
  tenant/i18n, administrative divisions).
- **Task 3.5 ban đầu** làm phẳng sub-feature. Review của chủ dự án chỉ ra việc đó quá tay với account:
  `account/components` nay được group lại theo trang (`booking-detail`, `bookings`, `favorites`,
  `messages`, `profile`, `recent`, `reviews`, `legal`, `account-shell`, `account-flow`, `shared`).
- **Task 3.6 bổ sung** — 48 hook feature-local nằm trong `features/*/hooks`; `components/` không còn file
  `use-*` hay helper `.ts`. Helper/type thuần được đưa sang `lib/`; hai barrel `components/index.ts`
  của `auth` và `partner-onboarding` đã xoá.

### Phase 4 — cắt đứt `features → routes`

- Audit thực tế có **20** feature file import `+types` (brief cũ chỉ đếm 10) và 3 import type qua
  `routes/account/layout`; tất cả đã thay bằng props suy từ server function qua `ServerDataFrom`.
- Xoá shim `routes/partner-onboarding/shared.tsx`; route và feature import trực tiếp component/lib owner.
- Hai booking-data resource route và booking-payment-status route chỉ còn delegate sang feature server;
  browser hook chỉ type-import result type từ `*.server.ts`.
- Điều kiện Phase 4 hiện rỗng:

  ```bash
  cd apps/storefront/app
  grep -rn "~/routes/\|routes/+types" features components
  ```

### Phase 5 — hàng rào

- ESLint chặn `features/components/hooks/constants → routes` và chặn `+types` ngoài route/root cho cả
  storefront lẫn dashboard. Import giả qua stdin đã bị từ chối đúng kỳ vọng.
- Cài `eslint-plugin-react-hooks@7.1.1`: `rules-of-hooks` là error,
  `exhaustive-deps` là warning để không tự đổi runtime. Storefront hiện có 3 warning đã ghi nhận
  (`days` ×2, `durationSlots` ×1); dashboard và `packages/ui` sạch.
- Thêm `pnpm check:frontend-structure`. Bucket/feature/server placement đều xanh; LOC gate storefront
  chỉ đỏ `routes/bookings.tsx` (236 dòng), đúng nợ Phase 8. Script **chưa nối CI**.

---

## 3. Trạng thái xác minh

Lần xác minh gần nhất ngày 2026-07-28:

```bash
PATH="/Users/duyvo/.nvm/versions/node/v24.18.0/bin:$PATH" \
  pnpm turbo typecheck build --filter=@booking/storefront... \
    --filter=@booking/dashboard... --force                  # 14/14 successful
pnpm --filter=@booking/storefront lint                      # 0 error, 3 warning đã ghi nhận
pnpm --filter=@booking/dashboard lint                       # clean
pnpm --filter=@booking/ui lint                              # clean
pnpm --filter=@booking/storefront security                  # passed
pnpm check:no-tests                                         # passed
```

`.nvmrc` yêu cầu 22.22.0 nhưng máy hiện không cài đúng patch đó; Node 24.18.0 là bản đã dùng để verify.

React Doctor scoped `--base HEAD` không thấy React source nào đổi trong Phase 5. Scan rộng branch so
với `main` là 70/100 với 2 warning có sẵn từ phase trước (`account-primitives` dùng index key,
`catalog-route.server` có `map().filter(Boolean)`); không sửa trong phase hàng rào này.

Các bất biến cấu trúc, kiểm bằng tay ngày 2026-07-28 — **tất cả đều pass**:

```bash
find apps/storefront/app/features -mindepth 2 -maxdepth 2 -type d \
  | grep -vE '/(components|hooks|server|lib)$'                   # rỗng
find apps/storefront/app/features -name '*.server.ts' | grep -v '/server/'   # rỗng
cd apps/storefront/app && grep -rn "from '\.\./" . --include='*.ts' --include='*.tsx' \
  | grep -v '+types'                                             # rỗng
cd apps/storefront/app && grep -rn "~/routes/\|routes/+types" features components  # rỗng
```

---

## 4. Bẫy đã dẫm phải — đọc trước khi làm tiếp

1. **`pnpm --filter=@booking/storefront typecheck` chạy một mình sẽ NÓI DỐI.** Nó dựng type từ `dist/` cũ
   của `@booking/contracts` + `@booking/i18n` và báo **17 lỗi giả** (`NsI18n.Platform`,
   `PublicListingDetailWithTimezoneResponse`, `resourceTimezone`…). Luôn dùng
   `pnpm turbo typecheck build --filter=@booking/storefront...` — **dấu `...` cuối là bắt buộc**.
2. **PATH mặc định hiện trỏ Node v22.12.0**, thấp hơn yêu cầu 22.22.0 của React Router 8.
   `.nvmrc` = 22.22.0 nhưng máy chưa có đúng bản đó; dùng Node 24.18.0 đã cài sẵn.
3. **`./+types/*` KHÔNG resolve qua `~/`.** Nó chỉ resolve qua thủ thuật `rootDirs` trong tsconfig, tức
   phải là đường dẫn tương đối. Đây là lý do Phase 4 không đổi chúng sang alias mà xoá toàn bộ dependency
   `features → routes`; hiện chỉ route module được import `./+types/*`.
4. **`pnpm format` trần reformat ~250 file ngoài storefront** (apps/api, dashboard, packages, cả
   `.vscode/mcp.json`). Luôn dùng `pnpm exec prettier --write apps/storefront/app`.
5. **`git mv` tự stage.** Khi làm nhiều `git mv` rồi commit từng nhóm, `git commit` sẽ nuốt luôn nhóm sau.
   Dùng `git commit -- <đường dẫn>` hoặc `git restore --staged` trước khi commit.
6. **Lỗi trong plan gốc, đã sửa hai lần:** plan từng coi `account` là đã đúng, rồi làm phẳng toàn bộ
   component. Chủ dự án chốt shape cuối là `{components,hooks,server,lib}` và cho phép group component
   theo trang bên trong `account/components`. Gate Phase 5 phải kiểm đúng shape này, không quay lại
   flatten hook/helper vào `components`.

---

## 5. Làm tiếp thế nào

### Thứ tự KHÔNG được đảo

- Phase 4 (cắt `features → routes`) đã hoàn tất trước Phase 5 đúng như yêu cầu.
- Phase 5 (hàng rào) đã hoàn tất trước 6–12, mọi phase sau được boundary/lint canh.
- `check:frontend-structure` chỉ nối vào CI ở **Phase 8**. LOC gate hiện bắt
  `routes/bookings.tsx`; Phase 8 còn mở rộng gate để bắt support declaration/module mà LOC không thấy.

### Quyết định đã chốt với chủ dự án (đừng hỏi lại)

- **Phase 7** — DUYỆT gộp 3 page shell, chấp nhận 3 thay đổi pixel ở **trang packages**:
  `bg-muted/40`→`/30`, `py-6`→`py-4`, `MapPin size-5`→`size-4`. Landmark `<main>` áp cho cả 3 trang.
- **Phase 11.2** — DUYỆT gỡ sạch mock. `accountMocksEnabled()` = `!production` nên **UI production không
  đổi**; chỉ dev mất dữ liệu giả, đó là mục tiêu. Xoá `mock-data.server.ts`,
  `account-listings.server.ts`, toàn bộ UI chat của `/account/messages`;
  `MockDisabledState` → `FeatureUnavailableState`.
- **Phase 6.1** — dialog shell dùng **CSS-branch** (`hidden lg:block`) làm chuẩn, không dùng JS `isDesktop`
  (SSR-đúng, không nháy sau hydrate). Nếu chạy thử thấy dialog packages **đổi hình** thì dừng và hỏi.
- **Task 3.4 bổ sung** — module BFF/domain shared vẫn phải có owner feature; `app/lib` chỉ giữ hạ tầng
  và shared request concern. Cross-feature import type/read là hợp lệ, không phải lý do để để domain
  module ở `app/lib`.
- **Route convention (chốt 2026-07-28)** — lấy convention được ghi trong dashboard làm chuẩn, không
  copy nợ hiện hữu của dashboard. `routes/` chỉ chứa file được đăng ký trong route config và chỉ có
  React Router exports mỏng; UI/helper/handler/constants/response builder về owner feature. Storefront
  không có ngoại lệ support file trong `routes/`; `legacy/redirect.server.ts` phải rời khỏi đây.

### Quy trình đang dùng

Ledger git-ignored từng được ghi ở
`.superpowers/sdd/2026-07-28-storefront-dashboard-convention-refactor/`, nhưng tại lần bàn giao này
thư mục đó **không có trên máy**. Handoff này và plan trong `docs/superpowers/plans/` là nguồn duy nhất.

### Việc đầu tiên hôm sau

Phase 6.1 — gộp hai booking dialog shell theo quyết định đã chốt: lấy CSS branch
`hidden lg:block` làm chuẩn SSR. Copy/move nguyên DOM và className; chạy thử packages dialog ở desktop
và mobile. Nếu khác hình, dừng và báo chủ dự án.

---

## 6. Prompt bàn giao (dán nguyên văn cho agent tiếp theo)

````text
Tiếp tục refactor trong monorepo tại `/Users/duyvo/Desktop/booking-saas`.

## Trạng thái

Nhánh `refactor/storefront-dashboard-convention`.
Mục tiêu tổng: đưa `apps/storefront` về đúng convention của `apps/dashboard`, chia 13 phase.
**Phase 1–5 đã xong. Phase 3 và Phase 8 scope đã được bổ sung theo review của chủ dự án.
Phase 6–13 chưa làm.** Việc của bạn: làm tiếp từ Phase 6.

## Đọc trước khi gõ bất cứ thứ gì

1. `docs/refactor/storefront-convention-HANDOFF.md` — bàn giao đầy đủ, đọc HẾT.
2. `docs/superpowers/plans/2026-07-28-storefront-dashboard-convention-refactor.md` — plan 13 phase,
   đọc `## Global Constraints` + Phase 6.
3. `AGENTS.md` và `apps/storefront/CLAUDE.md` — luật chung của repo.

Thư mục `.superpowers/sdd/2026-07-28-storefront-dashboard-convention-refactor/` hiện không có trên
máy. Nó git-ignored, nên handoff doc và plan là nguồn duy nhất.

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
PATH="/Users/duyvo/.nvm/versions/node/v24.18.0/bin:$PATH" \
  pnpm turbo typecheck build --filter=@booking/storefront... \
    --filter=@booking/dashboard... --force
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/ui lint
pnpm --filter=@booking/storefront security
```

⚠️ **`pnpm --filter=@booking/storefront typecheck` chạy MỘT MÌNH sẽ báo 17 lỗi GIẢ**
(`NsI18n.Platform`, `PublicListingDetailWithTimezoneResponse`, `resourceTimezone`…). Nguyên nhân là
`dist/` cũ của `@booking/contracts` + `@booking/i18n`, không phải lỗi code. Đừng "sửa" chúng.

Chạy verify **sau mỗi commit**, không phải chỉ ở cuối.

## 6 cái bẫy đã có người dẫm

1. Typecheck storefront standalone báo lỗi giả; dùng Turbo với dấu `...`.
2. PATH mặc định là Node 22.12.0, thấp hơn yêu cầu 22.22.0; dùng Node 24.18.0 đã cài sẵn.
3. **`./+types/*` KHÔNG resolve qua alias `~/`**. Phase 4 đã xoá sạch dependency này khỏi features;
   chỉ route module được import `./+types/*`.
4. **`pnpm format` trần reformat ~250 file ngoài storefront.** Chỉ dùng
   `pnpm exec prettier --write apps/storefront/app`.
5. **`git mv` tự stage.** Kiểm index trước mọi commit.
6. Shape feature đã chốt là `{components,hooks,server,lib}`. Hook feature-local ở `hooks`, helper/type
   thuần ở `lib`; component của các trang account được group theo tên trang.

## Trạng thái cấu trúc phải giữ

- `features/*/components` không còn `use-*` hoặc helper `.ts`.
- `account/components` được group theo trang.
- BFF/domain server nằm trong `features/<owner>/server`; `app/lib` chỉ giữ hạ tầng/shared request concern.
- Feature/components không còn import `routes` hoặc `routes/+types`.
- Hai resource loader booking-data và loader payment status delegate sang feature server.

Các lệnh sau phải rỗng:

```bash
find apps/storefront/app/features -mindepth 2 -maxdepth 2 -type d \
  | grep -vE '/(components|hooks|server|lib)$'
find apps/storefront/app/features -name '*.server.ts' | grep -v '/server/'
find apps/storefront/app/features -path '*/components/use-*'
find apps/storefront/app/features -path '*/components/*.ts'
cd apps/storefront/app && grep -rn "from '\.\./" . --include='*.ts' --include='*.tsx' | grep -v '+types'
cd apps/storefront/app && grep -rn "~/routes/\|routes/+types" features components
```

## Quyết định chủ dự án đã chốt — đừng hỏi lại, đừng tự đổi

- **Phase 3 bổ sung** — có `hooks/`; helper/type thuần ở `lib`; account group component theo trang;
  domain/BFF server rời `app/lib` về owner feature.
- **Phase 6.1** — dialog shell dùng CSS-branch (`hidden lg:block`), không dùng JS `isDesktop`.
- **Phase 7** — duyệt gộp 3 page shell, chấp nhận 3 thay đổi pixel ở trang packages:
  `bg-muted/40`→`/30`, `py-6`→`py-4`, `MapPin size-5`→`size-4`; landmark `<main>` cho cả 3.
- **Phase 11.2** — duyệt gỡ sạch mock; UI production không đổi vì mock vốn tắt ở production.
- **Route convention** — route module chỉ giữ React Router exports mỏng; mọi support function/module
  về owner feature. Gate route-only tạm áp storefront vì dashboard implementation còn nợ riêng.

## Trạng thái Phase 5

- Boundary ESLint đang bật cho cả hai frontend.
- React Hooks lint: storefront 0 error / 3 warning đã ghi nhận; dashboard/UI sạch. Không tự sửa warning
  dependency array trong phase khác.
- `pnpm check:frontend-structure` cố ý đỏ đúng `routes/bookings.tsx` cho tới Phase 8; chưa nối CI.

## Việc đầu tiên

Làm Phase 6.1: gộp dialog shell, lấy CSS branch `hidden lg:block` làm chuẩn. Giữ nguyên UI; chạy thử
packages dialog ở desktop/mobile và dừng hỏi nếu khác hình.

Nếu plan mâu thuẫn với các quyết định trong handoff này, handoff mới hơn thắng; cập nhật lại plan thay
vì làm theo dữ liệu audit cũ.
````
