# Bàn giao — Storefront refactor theo convention `apps/dashboard`

**Nhánh:** `refactor/storefront-dashboard-convention`
**Ngày:** 2026-07-28 · **Trạng thái:** Cả 13 phase đã xong; Phase 3 và Phase 8 scope đã bổ sung theo
review của chủ dự án; full static check toàn repo xanh
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
| 2 | 3 implementation song song cho "chọn ngày → chọn slot → quote" (~2.6k LOC) | 6 | ✅ |
| 3 | 2 dialog shell copy gần nguyên, khác nhau ở SSR/hydration | 6 | ✅ |
| 4 | 3 page shell copy tay và đã drift | 7 | ✅ |
| 5 | `routes/` không đồng nhất — `bookings.tsx` 236 dòng chứa cả UI | 8 | ✅ |
| 6 | i18n bypass — 20 chuỗi hardcode dù có sẵn 10 namespace | 9 | ✅ |
| 7 | `params.locale === 'en' ? 'en' : 'vi'` lặp 27 lần / 18 file audit cũ, 19 file sau Phase 9 | 10 | ✅ |
| 8 | Dead code: 1 component + controller, 39 i18n key mồ côi × 2 locale | 9 + 11 | ✅ |
| 9 | Mock data trong production path (`/account/messages` 100% giả) | 11 | ✅ |
| 10 | God file `platform-sections.tsx` 721 dòng | 12 | ✅ |
| 11 | `features/` shape không đồng nhất | 3 | ✅ |
| 12 | ESLint thiếu `eslint-plugin-react-hooks` | 5 | ✅ |

Audit bổ sung `routes/` sau Phase 4: 65 file route, 10 file chứa 21 top-level support declaration,
1 support module không phải route (`legacy/redirect.server.ts`) và 11 import route→route ngoài
`+types`. Phase 8 cũ chỉ liệt kê 3 route béo nên đã được mở rộng; xem quyết định ở §5.

---

## 2. Đã làm gì (Phase 1–13)

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
- Thêm `pnpm check:frontend-structure`. Tại cuối Phase 5, bucket/feature/server placement xanh nhưng
  LOC gate còn đỏ `routes/bookings.tsx` (236 dòng), nên chưa nối CI. Nợ này đã được giải quyết và gate
  được nối CI ở Phase 8.

### Phase 6 — gộp booking engine

- **6.1 (`33a3ed6a`)** — hai shell về một `booking-dialog-shell.tsx`. Listing giữ CSS branch. Riêng
  controlled packages phải chọn duy nhất Dialog hoặc Drawer bằng JS: cả hai content đều portal vào
  `body`, nên mount song song với cùng `open` tạo 2 overlay + 2 focus trap; chủ dự án đã duyệt ngoại lệ
  sau khi xem bằng chứng runtime.
- **6.2 (`7c96aa1d`)** — controller listing/packages về một
  `use-booking-dialog-controller.ts`; giữ cache availability, tách availability/quote error, hỗ trợ
  controlled open và return focus. Ba flow hourly/daily/package giữ nguyên checkout URL.
- **6.3 (`7aee924f`)** — steps/controller/slot-picker/slot-selection về `booking-widget`; hai primitive
  media đa-feature lên top-level `components`; pure package detail helper lên `app/lib`. Không còn
  runtime import ngược từ `booking-widget` sang `listing-group` hoặc `packages`. Steps lớn được tách
  thành section component nội bộ sau cảnh báo React Doctor.

### Phase 7 — gộp detail page shell (`494ffcc0`)

- Tạo `components/detail-page-layout.tsx` cho search/header/gallery/main/aside/footer và
  `components/detail-price-card.tsx` cho price surface.
- Listing, listing-group, packages cùng dùng một shell; landmark `<main>` thống nhất. Reviews vẫn defer
  ở listing/packages và eager ở listing-group.
- Chỉ packages đổi ba pixel đã duyệt: `bg-muted/40→/30`, `py-6→py-4`, `MapPin size-5→size-4`.

### Phase 8 — `routes/` chỉ còn route module

- **8.1 (`3057b70f`)** — `routes/bookings.tsx` từ 236 dòng thành adapter mỏng; page UI về
  `features/booking/components/bookings-lookup-page.tsx`, loader/action body về
  `features/booking/server/bookings-route.server.ts`.
- **8.2 (`0f2253ea`)** — chuyển nguyên JSX của community, account help/security/terms,
  partner-onboarding done và home sang component của owner feature; không đổi copy/className/DOM.
- **8.3 (`589f3b9c`)** — favorite-ref policy về `features/favorites/lib`, legacy redirect về
  `features/root/server`, set-locale action body về root server; xoá support module cuối cùng khỏi
  `routes/`.
- **8.4 (`b5a9b4cd`)** — action/loader body của favorite toggle, sitemap, hai upload presign và
  readiness probe về `features/{favorites,seo,storage}/server` hoặc `lib/readiness.server.ts`.
  Resource route không có default component giả.
- **8.5** — audit verification-only: 0 route→route import ngoài `./+types/*`; hai coupling mục tiêu đã
  được xoá trong 8.2/8.3 nên không tạo empty commit.
- **8.6 (`15e33f03`)** — structure gate đọc `app/routes.ts` làm source of truth và dùng TypeScript AST
  để chặn support file thừa, route module thiếu, top-level support declaration, export lạ,
  route→route import và route trên 120 dòng. Gate hiện xanh với **64/64** route module; route dài nhất
  60 dòng. Đã nối vào CI và full static check trong `AGENTS.md`.

### Phase 9 — i18n

- **9.1 (`7e1986a3`)** — 9 cặp copy Việt/Anh trong provider profile về typed key
  `catalog.provider.*`; nội dung hiển thị giữ nguyên.
- **9.2 (`6542f03b`)** — copy support còn lại trong booking history, review time, API failure,
  tenant availability, listing-group meta và structured data về đúng namespace.
- **9.3 (`89de1986`)** — meta của bookings, community và provider về feature `lib/*-meta.ts`; route chỉ
  delegate và truyền locale.
- **9.4 (`70079792`)** — 6 route ErrorBoundary dùng chung
  `components/storefront-route-error-boundary.tsx`; nhãn home lấy từ i18n. Booking-detail vẫn quay về
  trang tra cứu với `navigation.lookup`, không đổi URL/hành vi.
- **9.5 (`58c75ba8`)** — xoá đúng 39 key mồ côi khỏi mỗi locale, tổng 78 entry; scan usage trước khi
  xoá và typed translation shape đều xanh.

### Phase 10 — một source of truth cho locale param

- **`fdc017ad`** — thêm helper typed `localeParam(value)` vào `constants/paths.ts`.
- Thay đủ 27 ternary ở 19 consumer hiện tại: route meta/loader/action, root error fallback,
  request-security, tenant availability, `useLocale`, shared route error boundary và account
  booking-detail page. Audit gốc ghi 18 file; file thứ 19 là shared error boundary được thêm ở Phase 9.
- Scan toàn app chỉ còn đúng một ternary trong implementation của `localeParam`; mọi input khác `en`
  vẫn fallback `vi`, không đổi URL/request contract/UI.

### Phase 11 — xoá dead code và account presentation mock

- **11.1 (`b6faf932`)** — xoá settlement-dispute component/controller không có consumer và toàn bộ
  `account.bookings.disputePanel.*` ở hai locale: 239 dòng.
- **11.2 (`ab73b222`)** — xoá `mock-data.server.ts`, account listing fixture/BFF, messages loader,
  controller và UI chat giả. `/account/messages` luôn render đúng production-state “chưa khả dụng”;
  `/account/recent` trả mảng rỗng thay vì ghép dữ liệu thật với discount fixture bịa.
- `MockDisabledState` đổi thành `FeatureUnavailableState`, giữ nguyên JSX/className/copy; xoá
  `DemoNotice`, prop/key demo và ba message key vừa trở thành dead.
- `isMockPaymentRedirect` **không thuộc scope xoá**: đây là adapter dev-only của payment gateway dùng
  chung ba flow, bị environment guard cấm trong production. Lệnh grep `mock|Mock` rộng trong plan cũ
  đã được thay bằng scan đúng tên presentation mock.

### Phase 12 — tách platform landing god file (`aaef444f`)

- Audit chính xác là **11 public section export + 5 helper private + 5 bảng content**, không phải 12
  section export như số liệu cũ trong plan.
- Năm bảng content chuyển nguyên value/order/type sang
  `features/platform-landing/lib/platform-content.ts`.
- 11 section chuyển nguyên khối sang 11 file trong `components/sections/`; `SchedulePreview`,
  `TransformationList`, `CapabilityRow`, `DemoFigure`, `FooterGroup` vẫn private cạnh section owner.
- `platform-sections.tsx` từ 721 dòng còn barrel 11 dòng; `platform-landing.tsx` không phải đổi import.
- Không đổi JSX, className, copy, thứ tự render hay runtime contract.

Sau Phase 12, scan invariant bắt được 4 import `../` trong section mới; commit **`50601151`** đổi đúng
bốn specifier đó sang `~/`, không đổi code component hay runtime.

### Phase 13 — chốt tài liệu

- **13.1 (`9215ecfa`)** — `apps/storefront/CLAUDE.md` nay có folder architecture + import discipline
  rõ ràng, đúng shape `{components,hooks,server,lib}`, route-only rule và ba khác biệt storefront:
  tenant theo `Host`, `/:locale`, tenant theme untrusted ở `app/lib/theme.ts`. Sửa luôn câu stale trong
  dashboard doc: `../` hiện hữu là migration debt, không phải precedent.
- **13.2 (`0817a899`)** — `docs/conventions.md` ghi sáu bucket chung, owner placement, `~/`,
  route/server boundary và hai hàng rào ESLint + `check:frontend-structure`; narrow compatibility
  barrel được mô tả đúng với `platform-sections.tsx`.
- **13.3** verification-only: `AGENTS.md` đã có structure guard trong bảng Commands, full static check
  và mô tả CI từ Phase 8 nên không tạo diff trùng lặp.
- **13.4** full static check toàn repo xanh: Turbo 24/24, module graph 17 module không cycle, RLS 46/46.

### Correction sau Phase 13 — hook còn sót trong top-level components (`df1090cb`)

- Review của chủ dự án bắt được ba file controller hook trong `app/components` và
  `useIsNavigatingTo` export ngay trong `pending-link.tsx`; audit Phase 3 cũ chỉ quét
  `features/*/components` nên đã bỏ sót top-level.
- Chuyển nguyên ba controller và tách nguyên `useIsNavigatingTo` sang `app/hooks`; bốn consumer chỉ đổi
  import, không đổi logic/JSX/runtime.
- `check:frontend-structure` nay chặn cả file `use-*` lẫn exported hook trong shared `components/`, và
  áp cùng luật cho `features/*/components` của storefront. Probe file tạm đã làm gate đỏ đúng hai
  diagnostic rồi được xoá.

---

## 3. Trạng thái xác minh

Lần xác minh gần nhất ngày 2026-07-28:

```bash
PATH="/Users/duyvo/.nvm/versions/node/v24.18.0/bin:$PATH" \
  pnpm turbo lint typecheck build --filter=@booking/storefront...  # 15/15 successful
pnpm check:frontend-structure                                     # passed, 64/64 routes
pnpm --filter=@booking/storefront security                        # passed
pnpm check:no-tests                                               # passed
```

Full static check cuối Phase 13:

```bash
PATH="/Users/duyvo/.nvm/versions/node/v24.18.0/bin:$PATH" \
  pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
# passed: Turbo 24/24; module graph 17 modules; RLS 46/46
```

`.nvmrc` yêu cầu 22.22.0 nhưng máy hiện không cài đúng patch đó; Node 24.18.0 là bản đã dùng để verify.

React Doctor Task 11.1 scan 4 file đạt **100/100**. Task 11.2 scan 7 file báo storefront **89/100**,
`@booking/i18n` **100/100**, nhưng `diagnostics.json` rỗng nên không có regression actionable.
Phase 12 scan đúng diff chưa commit so với `HEAD` đạt **100/100**, không có diagnostic. Lint storefront
vẫn 0 error / 3 warning hook đã ghi nhận từ Phase 5. Correction `df1090cb` đạt React Doctor
**100/100**; full static check chạy lại trên correction đạt Turbo 24/24, module graph 17 modules và RLS
46/46.

Runtime Phase 12: bật API + storefront dev, request `/vi` với host chưa map tenant trả HTTP 200,
`<title>` platform đúng và SSR đủ `models`, `capabilities`, `workflow`, `demos`, `pricing`, `faq`,
`consultation`.

Browser verify desktop + mobile:

- listing hourly: 13 slot, 1 dialog content + 1 overlay;
- listing daily: range 29→30/07/2026 tạo checkout URL;
- package hourly: 12 slot vẫn còn trong lúc/sau quote, checkout URL có `packageId`;
- mobile package: 0 dialog content, 1 drawer content, 1 overlay, focus vào drawer title.
- ba detail page Phase 7 đều render đúng header/gallery/main/aside/footer; packages dùng đúng
  `bg-muted/30`, `py-4` và `MapPin size-4`.

Các bất biến cấu trúc, kiểm bằng tay ngày 2026-07-28 — **tất cả đều pass**:

```bash
find apps/storefront/app/features -mindepth 2 -maxdepth 2 -type d \
  | grep -vE '/(components|hooks|server|lib)$'                   # rỗng
find apps/storefront/app/features -name '*.server.ts' | grep -v '/server/'   # rỗng
find apps/storefront/app/components -name 'use-*'                           # rỗng
cd apps/storefront/app && grep -rn "from '\.\./" . --include='*.ts' --include='*.tsx' \
  | grep -v '+types'                                             # rỗng
cd apps/storefront/app && grep -rn "~/routes/\|routes/+types" features components  # rỗng
pnpm check:frontend-structure                                    # passed
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
- `check:frontend-structure` đã được mở rộng và nối CI ở **Phase 8**, sau khi 64 route module đều xanh.
  Dashboard tạm chỉ chịu bucket/feature/server-placement gate; semantic route-only gate sẽ bật sau
  audit/refactor dashboard riêng.

### Quyết định đã chốt với chủ dự án (đừng hỏi lại)

- **Phase 7** — DUYỆT gộp 3 page shell, chấp nhận 3 thay đổi pixel ở **trang packages**:
  `bg-muted/40`→`/30`, `py-6`→`py-4`, `MapPin size-5`→`size-4`. Landmark `<main>` áp cho cả 3 trang.
- **Phase 11.2** — DUYỆT gỡ sạch mock. `accountMocksEnabled()` = `!production` nên **UI production không
  đổi**; chỉ dev mất dữ liệu giả, đó là mục tiêu. Xoá `mock-data.server.ts`,
  `account-listings.server.ts`, toàn bộ UI chat của `/account/messages`;
  `MockDisabledState` → `FeatureUnavailableState`.
- **Phase 6.1** — listing shell dùng CSS branch. Controlled packages là ngoại lệ đã duyệt: chọn primitive
  bằng JS vì Dialog/Drawer portal; mount cả hai với cùng `open` tạo 2 overlay + 2 focus trap. Runtime
  desktop/mobile đã xác nhận mỗi breakpoint chỉ có đúng 1 content + 1 overlay.
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

Không còn phase implementation. Việc tiếp theo là review final branch diff/commit history, rồi
push/mở PR khi chủ dự án yêu cầu; không tự mở thêm scope refactor.

---

## 6. Prompt bàn giao (dán nguyên văn cho agent tiếp theo)

````text
Tiếp tục refactor trong monorepo tại `/Users/duyvo/Desktop/booking-saas`.

## Trạng thái

Nhánh `refactor/storefront-dashboard-convention`.
Mục tiêu tổng: đưa `apps/storefront` về đúng convention của `apps/dashboard`, chia 13 phase.
**Cả 13 phase đã xong. Phase 3 và Phase 8 scope đã được bổ sung theo review của chủ dự án; full
static check toàn repo xanh.** Không còn task implementation trong plan.

## Đọc trước khi gõ bất cứ thứ gì

1. `docs/refactor/storefront-convention-HANDOFF.md` — bàn giao đầy đủ, đọc HẾT.
2. `docs/superpowers/plans/2026-07-28-storefront-dashboard-convention-refactor.md` — plan 13 phase,
   đọc `## Global Constraints` + kết quả Phase 13.
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
pnpm check:frontend-structure
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
- `routes/` chỉ có 64 module đăng ký bởi `app/routes.ts`, không có support declaration/module.

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
- **Phase 6.1** — listing dùng CSS branch; controlled packages dùng JS chọn đúng một primitive vì
  Dialog/Drawer portal. Ngoại lệ này đã duyệt và runtime xác nhận không có duplicate overlay/focus trap.
- **Phase 7** — duyệt gộp 3 page shell, chấp nhận 3 thay đổi pixel ở trang packages:
  `bg-muted/40`→`/30`, `py-6`→`py-4`, `MapPin size-5`→`size-4`; landmark `<main>` cho cả 3.
- **Phase 11.2** — duyệt gỡ sạch mock; UI production không đổi vì mock vốn tắt ở production.
- **Route convention** — route module chỉ giữ React Router exports mỏng; mọi support function/module
  về owner feature. Gate route-only tạm áp storefront vì dashboard implementation còn nợ riêng.

## Trạng thái Phase 5–13

- Boundary ESLint đang bật cho cả hai frontend.
- React Hooks lint: storefront 0 error / 3 warning đã ghi nhận; dashboard/UI sạch. Không tự sửa warning
  dependency array trong phase khác.
- `pnpm check:frontend-structure` xanh với 64/64 route module và đã nối CI/full static check.
- Booking shell/controller/steps/slot picker đã hợp nhất trong `features/booking-widget`; không dựng lại
  implementation riêng trong `listing-group` hoặc `packages`.
- Ba detail page đã dùng chung `DetailPageLayout` và `DetailPriceCard`.
- Copy/meta/error-boundary trong scope Phase 9 đã dùng typed i18n; 39 key chết đã bị xoá ở cả `vi/en`.
- 27 call site normalize locale đều dùng helper typed `localeParam`; fallback vẫn là `vi`.
- Account presentation mock/demo scaffolding đã xoá; messages/recent chỉ còn production-state thật.
- Platform landing god file đã tách thành 11 section file + 1 content module; barrel cũ giữ nguyên
  public imports và không đổi JSX/className/copy.
- Tài liệu storefront/shared convention đã chốt; full static check cuối đạt Turbo 24/24, module graph
  17 modules không cycle và RLS 46/46.
- Correction sau review đã chuyển bốn shared hook còn sót khỏi `app/components` sang `app/hooks`; gate
  mới chặn cả tên file `use-*` và exported hook trong components.

## Việc đầu tiên

Không triển khai thêm phase. Kiểm tra branch sạch và review commit history/final diff; chỉ push hoặc mở
PR khi chủ dự án yêu cầu.

Nếu plan mâu thuẫn với các quyết định trong handoff này, handoff mới hơn thắng; cập nhật lại plan thay
vì làm theo dữ liệu audit cũ.
````
