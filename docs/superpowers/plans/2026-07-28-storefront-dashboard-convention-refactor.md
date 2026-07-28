# Storefront — Đại refactor theo convention của `apps/dashboard`

> **For agentic workers:** REQUIRED SUB-SKILL: dùng `superpowers:subagent-driven-development` hoặc
> `superpowers:executing-plans` để thực thi từng task. Các bước dùng checkbox (`- [ ]`).

**Goal:** Đưa `apps/storefront` về đúng 6 bucket + import discipline của `apps/dashboard`, dựng hàng rào
ESLint chặn tái phát, rồi gộp 3 implementation booking song song và dọn dead code — **không đổi UI** ngoài
3 điểm drift đã được liệt kê và cần bạn duyệt (Phase 7).

**Architecture:** Refactor thuần cơ học, tuần tự, mỗi phase để lại repo ở trạng thái verify-xanh.
Alias `~/` làm **trước tiên** vì sau đó mỗi lần move file chỉ phải sửa import của *bên gọi* (một token,
grep được), không phải sửa cả import nội bộ của file bị move.

**Tech Stack:** React Router 8 (framework mode, SSR), TypeScript strict, Tailwind v4, ESLint 9 flat
config, pnpm 10.13.1 + turbo, Node ≥ 22.22.0.

---

## Global Constraints

- **KHÔNG TEST.** ADR 0005 — tuyệt đối không tạo `*.spec.*` / `*.test.*` / vitest / playwright / script
  `test`. Quy tắc này **đè lên** mọi bước "write the failing test" của skill writing-plans.
- **Verify sau MỖI task** (đây là thứ thay cho test):
  ```bash
  nvm use   # .nvmrc = 22.22.0 — shell mặc định đang Node 20, sẽ fail ngay
  pnpm turbo typecheck build --filter=@booking/storefront...
  pnpm --filter=@booking/storefront lint
  pnpm --filter=@booking/storefront security
  ```
  ⚠️ **Không bao giờ** chạy `pnpm --filter=@booking/storefront typecheck` một mình — nó dựng type từ
  `dist/` cũ của `@booking/contracts` + `@booking/i18n` và báo 17 lỗi giả. Phải có `...` ở cuối filter.
- **Không đổi UI.** Không sửa className, không sửa cấu trúc DOM, không sửa copy. Ngoại lệ duy nhất:
  3 thay đổi pixel ở Phase 7 đã ghi rõ, cần duyệt trước khi làm.
- **Không đổi hành vi runtime.** Không đổi loader/action contract, không đổi URL, không đổi thứ tự fetch.
- **Không đổi schema, không đổi `@booking/contracts`, không đụng `apps/api`.**
- **Commit nhỏ, mỗi task một commit.** Branch: `refactor/storefront-dashboard-convention`.
- Import: `~/` cho mọi đường dẫn vượt cấp; `./sibling` giữ nguyên; `./+types/*` **chỉ** route module.

---

## Cấu trúc đích

```
apps/storefront/app/
  root.tsx  routes.ts  app.css  entry.server.tsx
  routes/                  CHỈ route module (loader/action/meta/ErrorBoundary + default re-export)
  features/<name>/{components, hooks, server, lib}
  components/              primitive dùng ở ≥2 feature
  constants/               paths.ts (storefrontPaths) + bảng nhãn
  hooks/                   hook dùng chéo feature
  lib/                     hạ tầng (*.server.ts) + helper thuần
```

### Bảng map bucket (nguồn → đích)

| Hiện tại | Đích | Ghi chú |
|---|---|---|
| `theme/theme.ts` | `lib/theme.ts` | |
| `lib/locale-paths.ts` | `constants/paths.ts` | dashboard: "constants/paths — single source of route URLs" |
| `lib/use-locale.ts`, `use-media-viewer-labels.ts`, `use-minimum-pending.ts`, `use-password-visibility.ts` | `hooks/` | |
| `layouts/site-header*.tsx`, `site-footer*.ts(x)`, `tenant-brand.tsx`, `use-site-header-*.ts` | `features/site-shell/components/` | |
| `layouts/account-flow-layout.tsx` | `features/account/components/` | chỉ account dùng |
| `templates/index.ts` | `features/home/lib/home-template.ts` | xem Task 2.4 |
| `templates/studio/home*.tsx`, `hero.tsx`, `brand-carousel.tsx`, `location-tabs.tsx`, `recommended-section.tsx`, `top-listings-section.tsx`, `use-studio-home-controller.ts`, `use-recommended-section-controller.ts` | `features/home/components/` | |
| `templates/studio/home-data.server.ts` | `features/home/server/` | |
| `templates/studio/home-listing-presentation.ts` | `features/home/lib/` | |
| `templates/studio/booking-panel*.tsx/.ts`, `use-booking-panel-*.ts` | `features/booking-widget/components/` | engine hợp nhất |
| `features/listing-group/listing-group-utils.ts` | `features/booking-widget/lib/slot-selection.ts` | packages + templates đều dùng |
| `features/listing-group/components/{expandable-description, header-actions, provider-card, studio-gallery, attribute-spec-cards}.tsx` | `components/` | dùng ở ≥2 feature |
| `features/packages/*` (14 file phẳng) | `features/packages/{components,lib}` | |
| `features/search/*` (9 file phẳng) | `features/search/{components,lib}` | |

---

# Phase 1 — Alias `~/`

### Task 1.1: Khai báo alias

**Files:**
- Modify: `apps/storefront/tsconfig.json`
- Modify: `apps/storefront/vite.config.ts`

**Interfaces:**
- Produces: `~/*` → `apps/storefront/app/*`, dùng được ở mọi file từ Task 1.2 trở đi.

- [ ] **Step 1: Thêm `paths` vào tsconfig** — chèn ngay sau `"moduleResolution": "bundler",`

```json
    "baseUrl": ".",
    "paths": {
      "~/*": ["./app/*"]
    },
```

- [ ] **Step 2: Thêm `resolve.alias` vào vite.config.ts** — chèn vào object `return {…}`, ngay sau
`plugins: [tailwindcss(), reactRouter()],` (copy nguyên từ `apps/dashboard/vite.config.ts:24-26`)

```ts
    resolve: {
      alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
    },
```

`fileURLToPath` đã được import sẵn ở dòng 3 — không thêm import.

- [ ] **Step 3: Verify** — chạy block verify ở Global Constraints. Kỳ vọng: xanh (chưa file nào dùng `~/`).

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/tsconfig.json apps/storefront/vite.config.ts
git commit -m "refactor(storefront): declare ~/ path alias like dashboard"
```

---

### Task 1.2: Codemod `../` → `~/`

Có **1166** import tương đối, trong đó **55** là `./+types` (không đụng) và **87** kiểu `./sibling`
(giữ nguyên — dashboard cũng vậy). Chỉ rewrite import vượt cấp (`../`).

**Files:**
- Create: `scripts/codemod/storefront-tilde-imports.mjs` (xoá ở Step 5)
- Modify: ~145 file dưới `apps/storefront/app/`

- [ ] **Step 1: Viết codemod**

```js
// scripts/codemod/storefront-tilde-imports.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const appRoot = resolve('apps/storefront/app');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.react-router', 'build', 'dist', '.turbo'].includes(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(appRoot)) {
  const src = readFileSync(file, 'utf8');
  // chỉ khớp specifier bắt đầu bằng '../' — './x' và './+types' không khớp
  const next = src.replace(
    /(\bfrom\s+|\bimport\s+|\bimport\(\s*)(['"])(\.\.\/[^'"]*)\2/g,
    (whole, kw, quote, spec) => {
      const abs = resolve(dirname(file), spec);
      if (!abs.startsWith(appRoot)) return whole; // ví dụ '../../../packages/...' — để nguyên
      const rel = relative(appRoot, abs).split('\\').join('/');
      return `${kw}${quote}~/${rel}${quote}`;
    },
  );
  if (next !== src) {
    writeFileSync(file, next);
    changed += 1;
  }
}
console.log(`rewrote ${changed} files`);
```

- [ ] **Step 2: Chạy**

```bash
node scripts/codemod/storefront-tilde-imports.mjs
```
Kỳ vọng in ra `rewrote ~145 files`.

- [ ] **Step 3: Kiểm tra không sót và không rewrite nhầm**

```bash
cd apps/storefront/app
grep -rn "from '\.\./" . --include="*.ts" --include="*.tsx" | grep -v "packages/" || echo "OK: het '../'"
grep -rn "from './+types" . --include="*.ts" --include="*.tsx" | wc -l   # phai van la 55
```

- [ ] **Step 4: Format + Verify**

```bash
pnpm format
```
rồi chạy block verify. Typecheck bắt hết mọi đường dẫn hỏng — nếu xanh là codemod đúng.

- [ ] **Step 5: Xoá codemod + Commit**

```bash
rm -rf scripts/codemod
git add -A apps/storefront
git commit -m "refactor(storefront): rewrite parent-relative imports to ~/ alias"
```

---

### Task 1.3: Sửa CLAUDE.md của storefront (doc đang sai)

`apps/storefront/CLAUDE.md:16-17` nói *"the `~/` alias is declared in tsconfig but code uses relative
paths"* — sai ở cả hai vế: tsconfig **không** khai báo alias, và giờ code **dùng** `~/`.

- [ ] **Step 1: Thay đoạn "Relative imports"** (dòng 16-17) bằng:

```markdown
- **`~/` alias** cho mọi import vượt cấp (`~/lib/i18n`, `~/components/section-card`), `./sibling` cho
  cùng thư mục — giống hệt dashboard. Không dùng `../` nữa.
```

- [ ] **Step 2: Commit**

```bash
git add apps/storefront/CLAUDE.md
git commit -m "docs(storefront): fix stale import-convention note"
```

---

# Phase 2 — Dồn về 6 bucket của dashboard

> Mẫu chung cho mọi task move: `git mv` → sửa import của bên gọi bằng `grep -rl … | xargs sed -i ''` →
> `pnpm format` → verify → commit. Vì đã có alias, import **nội bộ** của file bị move không đổi.

### Task 2.1: `theme/` → `lib/theme.ts`

**Files:** Move `app/theme/theme.ts` → `app/lib/theme.ts`; xoá thư mục `app/theme/`.

- [ ] **Step 1: Move + rewrite**

```bash
cd apps/storefront
git mv app/theme/theme.ts app/lib/theme.ts
rmdir app/theme
grep -rl "~/theme/theme" app | xargs sed -i '' "s|~/theme/theme|~/lib/theme|g"
```

- [ ] **Step 2: Verify + Commit**

```bash
pnpm format && cd ../.. && pnpm turbo typecheck build --filter=@booking/storefront...
git add -A apps/storefront && git commit -m "refactor(storefront): move theme into lib/"
```

---

### Task 2.2: `lib/locale-paths.ts` → `constants/paths.ts`

Dashboard: *"constants/paths — dashboardPaths, the single source of route URLs"*. File này export
`storefrontPaths`, `localeFromPath`, `switchLocalePath` — giữ nguyên cả 3, chỉ đổi chỗ.

- [ ] **Step 1: Move + rewrite**

```bash
cd apps/storefront
mkdir -p app/constants
git mv app/lib/locale-paths.ts app/constants/paths.ts
grep -rl "~/lib/locale-paths" app | xargs sed -i '' "s|~/lib/locale-paths|~/constants/paths|g"
```

- [ ] **Step 2: Verify + Commit** (như Task 2.1, message
`refactor(storefront): move locale-paths to constants/paths`)

---

### Task 2.3: 4 hook trong `lib/` → `hooks/`

**Files:** `lib/{use-locale, use-media-viewer-labels, use-minimum-pending, use-password-visibility}.ts`
→ `hooks/`.

- [ ] **Step 1: Move + rewrite**

```bash
cd apps/storefront
mkdir -p app/hooks
for f in use-locale use-media-viewer-labels use-minimum-pending use-password-visibility; do
  git mv "app/lib/$f.ts" "app/hooks/$f.ts"
  grep -rl "~/lib/$f" app | xargs sed -i '' "s|~/lib/$f|~/hooks/$f|g"
done
```

- [ ] **Step 2: Kiểm `lib/submission-lock.ts`** — mở file; nếu nó export một hook (`use*`) thì move sang
`hooks/` theo cùng cách, nếu là helper thuần thì để nguyên trong `lib/`.

- [ ] **Step 3: Verify + Commit** (`refactor(storefront): move cross-feature hooks to hooks/`)

---

### Task 2.4: `templates/` → `features/home/` + `features/booking-widget/`

`templates/index.ts` hiện là abstraction chết: `homeTemplateFor(_vertical)` bỏ luôn tham số và luôn trả
`StudioHome`. **Quyết định: giữ cái seam nhưng làm cho nó thật** — `switch` có case rõ ràng, để Phase 2/3
sau này thêm vertical là thấy ngay chỗ thêm, và ESLint không còn thấy tham số chết.

**Files:**
- Create: `app/features/home/{components,lib,server}/`, `app/features/booking-widget/components/`
- Move: 16 file từ `app/templates/`
- Delete: `app/templates/`

- [ ] **Step 1: Move nhóm home**

```bash
cd apps/storefront/app
mkdir -p features/home/components features/home/lib features/home/server features/booking-widget/components
for f in home hero brand-carousel location-tabs recommended-section top-listings-section \
         use-studio-home-controller use-recommended-section-controller; do
  git mv templates/studio/$f.tsx features/home/components/$f.tsx 2>/dev/null || \
  git mv templates/studio/$f.ts  features/home/components/$f.ts
done
git mv templates/studio/home-data.server.ts          features/home/server/home-data.server.ts
git mv templates/studio/home-listing-presentation.ts features/home/lib/home-listing-presentation.ts
```

- [ ] **Step 2: Move nhóm booking panel**

```bash
for f in booking-panel booking-panel-daily-picker booking-panel-hourly-picker \
         booking-panel-inventory-picker booking-panel-presentation booking-panel-types \
         use-booking-panel-controller use-booking-panel-daily-picker-controller \
         use-booking-panel-hourly-picker-controller; do
  git mv templates/studio/$f.tsx features/booking-widget/components/$f.tsx 2>/dev/null || \
  git mv templates/studio/$f.ts  features/booking-widget/components/$f.ts
done
```

- [ ] **Step 3: Tạo `features/home/lib/home-template.ts`** với nội dung dưới, rồi
`git rm app/templates/index.ts` và `rmdir` cây `templates/`:

```ts
import type { PublicListingResponse, PublicListingTypeResponse } from '@booking/contracts';
import type { LocationOption } from '~/features/search/search-form';
import type { StorefrontTenant } from '~/lib/tenant.server';
import { StudioHome } from '~/features/home/components/home';

/**
 * Vertical → home template (§16.1). `tenants.vertical` chọn layout gốc.
 * Phase 1 chỉ có `studio`; các vertical khác fallback về nó cho tới khi có template riêng.
 */
export interface HomeTemplateProps {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  listings: PublicListingResponse[];
  locations: LocationOption[];
}

export function homeTemplateFor(
  vertical: StorefrontTenant['vertical'],
): (props: HomeTemplateProps) => React.ReactNode {
  switch (vertical) {
    case 'studio':
    default:
      return StudioHome;
  }
}
```

- [ ] **Step 4: Rewrite import của bên gọi**

```bash
cd apps/storefront
grep -rl "~/templates'" app | xargs sed -i '' "s|~/templates'|~/features/home/lib/home-template'|g"
grep -rl "~/templates/studio/booking-panel" app | xargs sed -i '' \
  "s|~/templates/studio/booking-panel|~/features/booking-widget/components/booking-panel|g"
grep -rl "~/templates/studio/" app | xargs sed -i '' \
  "s|~/templates/studio/|~/features/home/components/|g"
grep -rn "~/templates" app || echo "OK: het ~/templates"
```

- [ ] **Step 5: Verify + Commit** (`refactor(storefront): fold templates/ into features/home and features/booking-widget`)

---

### Task 2.5: `layouts/` → `features/site-shell/` + `features/account/`

- [ ] **Step 1: Move**

```bash
cd apps/storefront/app
mkdir -p features/site-shell/components
for f in site-header site-header-account-menu site-header-mobile-menu site-footer tenant-brand; do
  git mv layouts/$f.tsx features/site-shell/components/$f.tsx
done
git mv layouts/site-footer-fallback.ts                    features/site-shell/components/site-footer-fallback.ts
git mv layouts/use-site-header-account-menu-controller.ts features/site-shell/components/use-site-header-account-menu-controller.ts
git mv layouts/use-site-header-mobile-menu-controller.ts  features/site-shell/components/use-site-header-mobile-menu-controller.ts
git mv layouts/account-flow-layout.tsx                    features/account/components/account-flow-layout.tsx
rmdir layouts
```

- [ ] **Step 2: Rewrite**

```bash
cd apps/storefront
grep -rl "~/layouts/account-flow-layout" app | xargs sed -i '' \
  "s|~/layouts/account-flow-layout|~/features/account/components/account-flow-layout|g"
grep -rl "~/layouts/" app | xargs sed -i '' "s|~/layouts/|~/features/site-shell/components/|g"
grep -rn "~/layouts" app || echo "OK: het ~/layouts"
```

- [ ] **Step 3: Verify + Commit** (`refactor(storefront): fold layouts/ into features/site-shell`)

---

### Task 2.6: Nâng 5 component dùng chéo lên `components/`

`features/listing` và `features/packages` đang với tay vào `features/listing-group/components/`.
Dashboard: `components/` = *"multi-area primitives only"*. 5 file này đúng là vậy.

- [ ] **Step 1: Move**

```bash
cd apps/storefront/app
for f in expandable-description header-actions provider-card studio-gallery attribute-spec-cards; do
  git mv features/listing-group/components/$f.tsx components/$f.tsx
done
git mv features/listing-group/components/use-header-actions-controller.ts   components/use-header-actions-controller.ts
git mv features/listing-group/components/use-studio-gallery-controller.ts   components/use-studio-gallery-controller.ts
```

- [ ] **Step 2: Rewrite**

```bash
cd apps/storefront
for f in expandable-description header-actions provider-card studio-gallery attribute-spec-cards \
         use-header-actions-controller use-studio-gallery-controller; do
  grep -rl "~/features/listing-group/components/$f" app | xargs sed -i '' \
    "s|~/features/listing-group/components/$f|~/components/$f|g"
done
```

- [ ] **Step 3: Verify + Commit** (`refactor(storefront): promote shared listing primitives to components/`)

---

# Phase 3 — Chuẩn hoá `features/<name>/{components, hooks, server, lib}`

### Task 3.1: `features/packages/` (14 file phẳng)

- [ ] **Step 1: Move**

```bash
cd apps/storefront/app/features/packages
mkdir -p components lib
for f in package-albums package-booking-dialog package-booking-dialog-shell package-booking-dialog-steps \
         package-listing-page package-media-details package-table related-listings \
         use-package-albums-controller use-package-booking-controller \
         use-package-booking-dialog-controller use-package-booking-dialog-shell-controller \
         use-package-booking-dialog-steps-controller; do
  git mv $f.tsx components/$f.tsx 2>/dev/null || git mv $f.ts components/$f.ts
done
git mv package-data.ts lib/package-data.ts
```

- [ ] **Step 2: Rewrite** (chạy từ `apps/storefront`)

```bash
grep -rl "~/features/packages/package-data" app | xargs sed -i '' \
  "s|~/features/packages/package-data|~/features/packages/lib/package-data|g"
grep -rlE "~/features/packages/(package-|use-|related-)" app | xargs sed -i '' -E \
  "s|~/features/packages/(package-\|use-\|related-)|~/features/packages/components/\1|g"
```
Sau đó sửa tay import **nội bộ** giữa các file vừa move (chúng dùng `./sibling` nên phần lớn không đổi;
chỉ file trong `components/` trỏ tới `package-data` là phải thành `~/features/packages/lib/package-data`).

- [ ] **Step 3: Verify + Commit** (`refactor(storefront): normalize features/packages layout`)

---

### Task 3.2: `features/search/` (9 file phẳng)

- [ ] **Step 1: Move** — `.tsx` + controller → `components/`; `search-state.ts`, `search-form-types.ts` → `lib/`

```bash
cd apps/storefront/app/features/search
mkdir -p components lib
for f in deferred-search-bar search-date-picker search-form search-form-controls \
         use-location-combobox-controller use-search-date-picker-controller use-search-form-controller; do
  git mv $f.tsx components/$f.tsx 2>/dev/null || git mv $f.ts components/$f.ts
done
git mv search-state.ts      lib/search-state.ts
git mv search-form-types.ts lib/search-form-types.ts
```

- [ ] **Step 2: Rewrite** — cùng kiểu Task 3.1. Chú ý `LocationOption` được export từ `search-form.tsx`
và bị import ở `features/home/lib/home-template.ts` + `features/home/components/{hero,home}.tsx`.

- [ ] **Step 3: Verify + Commit** (`refactor(storefront): normalize features/search layout`)

---

### Task 3.3: Các feature còn lại

Đưa về `{components, server, lib}` (bỏ folder nào feature không có). Làm **từng feature một commit**,
verify giữa mỗi cái:

- [ ] `features/booking/` — `booking-payment-state.ts` → `lib/`; `use-adaptive-payment-polling.ts`,
      `use-booking-detail-controller.ts` → `components/`
- [ ] `features/catalog/` — `catalog-page.tsx`, `use-catalog-page-controller.ts` → `components/`;
      `catalog-meta.ts` → `lib/`
- [ ] `features/checkout/` — `checkout-page.tsx`, `use-checkout-page-controller.ts` → `components/`;
      `checkout-presentation.ts` → `lib/`
- [ ] `features/listing/` — `listing-page.tsx` → `components/`; `listing-meta.ts`,
      `listing-structured-data.ts` → `lib/`
- [ ] `features/listing-group/` — `listing-group-page.tsx` → `components/`; `listing-group-meta.ts`,
      `listing-group-structured-data.ts`, `listing-group-types.ts`, `room-attributes.ts` → `lib/`
- [ ] `features/provider/` — 2 `.tsx` → `components/`
- [ ] `features/root/` — `root-meta.ts`, `storefront-context.ts` → `lib/`
- [ ] `features/favorites/` — `favorites-context.tsx`, `use-favorites-controller.ts` → `components/`
- [ ] `features/content-reports/` — `.tsx` + controller → `components/`; `content-report.server.ts` → `server/`
- [ ] `features/auth/` — xoá `auth-ui.tsx` (chỉ là `export * from './ui'`), đổi `ui/` → `components/`,
      rewrite 9 route `~/features/auth/auth-ui` → `~/features/auth/components`
- [ ] `features/affiliate/application/` → `features/affiliate/{components,server}`
- [ ] `features/platform-landing/` — thêm `lib/` khi Phase 12 tách file
- [ ] `features/account/` — đã đúng; chỉ kiểm `account-listing-item.ts`, `account-menu.ts`,
      `account-nav.ts` → `lib/`
- [ ] `features/partner-onboarding/` — `shared/` → `components/` (xem Task 4.2)

Mỗi bước: move → rewrite → `pnpm format` → verify → commit
(`refactor(storefront): normalize features/<name> layout`).

---

### Task 3.4: Đưa `lib/*.server.ts` về đúng feature

Quyết định ban đầu chỉ move module có đúng một consumer feature. Review của chủ dự án đã sửa quy tắc:
**shared không đồng nghĩa với hạ tầng**. BFF/domain module phải có owner feature kể cả khi nhiều feature
đọc nó; `app/lib` chỉ giữ hạ tầng và shared request concern.

- [x] Move 3 module single-owner theo audit ban đầu:
  `auth-routes`, `checkout-idempotency`, `listing-booking-data`.
- [x] Move thêm 9 BFF/domain module về owner:
  `affiliate`, `auth-flow`, `booking`, `catalog`, `checkout-flow`, `partner`,
  `payment-redirect`, `public-reviews`, `recent`.
- [x] Sửa toàn bộ import nội bộ của file vừa move sang `~/lib/*` khi cần hạ tầng.
- [x] `app/lib` còn 22 `*.server.ts`, chỉ gồm API/session/auth context, Redis/env,
  request parsing/security, tenant/i18n, administrative divisions và upload concern.
- [x] Verify không còn `*.server.ts` nằm ngoài `features/*/server` hoặc `app/lib`.

---

### Task 3.5: Chuẩn hoá account và partner-onboarding — **SỬA LỖI PLAN, CHỐT LẠI 2026-07-28**

> Task 3.3 ghi *"`features/account/` — đã đúng"*. **Sai.** `account/` có đủ `{components,server,lib}`
> nhưng còn **6 thư mục con** nữa, và `partner-onboarding/` còn **5**. Dashboard có **zero** nesting
> ngoài `{components, server, lib}`; bất biến #2 của `check:frontend-structure` (Task 5.3) sẽ đỏ vì 11
> thư mục này, bất biến #3 cũng đỏ vì `*.server.ts` đang ở độ sâu 3. Sau review, chủ dự án chốt:
> **feature level 2** chỉ có `{components,hooks,server,lib}`, nhưng `account/components` được group theo
> trang; controller hook phải ở `hooks`, helper/type thuần ở `lib`.

Quyết định flatten hoàn toàn account trong bản plan cũ đã bị thay thế vì 38 component phẳng làm mất
ranh giới trang.

**Files:**
- Move: server → `server/`, hook/controller → `hooks/`, helper/type → `lib/`, UI → `components/`
- Delete: `features/account/{bookings,favorites,messages,profile,recent,reviews}/`,
  `features/partner-onboarding/{done,password,profile,start,verify}/`
- Group account UI lại dưới
  `components/{booking-detail,bookings,favorites,messages,profile,recent,reviews,legal,...}/`

- [x] Tách 48 hook feature-local sang `features/*/hooks`.
- [x] Tách helper/type thuần sang `features/*/lib`; `components/` không còn helper `.ts`.
- [x] Group account UI theo trang dưới `components/`.
- [x] Xoá barrel component của auth và partner-onboarding; import trực tiếp file owner.
- [x] Xác nhận bất biến:

```bash
# -mindepth 2 là bắt buộc: thiếu nó thì chính `features/` và `features/<name>/` cũng lọt vào kết quả
# và tạo false positive.
find apps/storefront/app/features -mindepth 2 -maxdepth 2 -type d \
  | grep -vE '/(components|hooks|server|lib)$' && echo "CON VI PHAM" || echo "OK: chi con components/hooks/server/lib"
find apps/storefront/app/features -name '*.server.ts' | grep -v '/server/' && echo "SERVER SAI CHO" || echo "OK: server dung cho"
cd apps/storefront/app && grep -rn "from '\.\./" . --include="*.ts" --include="*.tsx" | grep -v "+types"
```

- [x] Verify typecheck/lint/security.

---

# Phase 4 — Cắt đứt `features/ → routes/`

Dashboard có **0** vi phạm. Audit ban đầu thấy 10 file import `routes/+types` + 4 file import runtime
qua shim `routes/`; audit sau khi flatten account/partner phát hiện thêm 10 `+types` và 3 type import
qua `routes/account/layout`. Phase này phải cắt toàn bộ, không chỉ danh sách ban đầu.

### Task 4.1: Bỏ `routes/+types` khỏi `features/` (20 file + 3 account context import)

Nguyên tắc: route module là **chỗ duy nhất** biết `Route`. Feature nhận prop có kiểu tự khai.

**Files:** `features/{booking/use-booking-detail-controller.ts, catalog/…/catalog-page.tsx,
provider/provider-route-page.tsx, provider/provider-profile-page.tsx, checkout/…/checkout-page.tsx,
checkout/…/use-checkout-page-controller.ts, packages/…/package-listing-page.tsx,
affiliate/…/affiliate-application-page.tsx, listing/…/listing-page.tsx,
listing-group/lib/listing-group-types.ts}`

- [x] **Step 1: Với mỗi file, thay `Route.ComponentProps` bằng kiểu suy từ server module.**
Mẫu — `features/catalog/components/catalog-page.tsx`:

```ts
// TRƯỚC
import type { Route } from '~/routes/+types/catalog';
export function CatalogPage({ loaderData, params }: Route.ComponentProps) { … }

// SAU
import type { loadCatalogRoute } from '~/features/catalog/server/catalog-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';

export interface CatalogPageProps {
  loaderData: ServerDataFrom<typeof loadCatalogRoute>;
  params: { locale: string; typeSlug: string };
}
export function CatalogPage({ loaderData, params }: CatalogPageProps) { … }
```
Route module không đổi — `<CatalogPage {...props} />` vẫn khớp cấu trúc.

- [x] **Step 2: Verify** — typecheck chứng minh kiểu route và feature vẫn khớp.

- [x] **Step 3: Đưa `AccountOutletContext` về feature hook**, xoá nốt 3 type import qua route layout.

---

### Task 4.2: Xoá shim re-export ngược

`routes/partner-onboarding/shared.tsx` chỉ là `export * from '~/features/partner-onboarding/shared'`,
mà 4 file trong `features/` lại import **qua** nó → vòng ngược `features → routes → features`.

- [x] **Step 1: Trỏ thẳng vào feature**

```bash
cd apps/storefront
grep -rl "~/routes/partner-onboarding/shared" app | xargs sed -i '' \
  "s|~/routes/partner-onboarding/shared|~/features/partner-onboarding/components|g"
```

- [x] **Step 2: Sửa route module** (`become-affiliate.tsx`, `become-partner.tsx`,
`partner-onboarding/{profile,password,done,verify}.tsx`) đang `import { partnerMeta } from './shared'`
→ `from '~/features/partner-onboarding/components/partner-onboarding-meta'`.

- [x] **Step 3: Xoá shim**

```bash
git rm apps/storefront/app/routes/partner-onboarding/shared.tsx
```

- [x] **Step 4: Verify**

---

### Task 4.3: Đưa loader của 2 resource route vào feature

`features/packages/hooks/use-package-booking-dialog-controller.ts` và
`features/booking-widget/hooks/…` từng type fetcher bằng
`import type { loader } from '~/routes/listing-booking-data'` — vẫn là features→routes.

> Task 3.4 đã đưa `listing-booking-data.server.ts` vào `features/booking-widget/server/`. Task này chỉ
> còn việc nuốt nốt thân loader của 2 route vào cùng thư mục đó.

- [x] **Step 1: Thêm vào `features/booking-widget/server/listing-booking-data.server.ts`** thân loader
hiện có trong `routes/listing-booking-data.tsx` và `routes/listing-group-booking-data.tsx`
(hai cái chỉ khác một dòng kiểm `listing.group?.slug !== params.groupSlug`), export:

```ts
export async function loadListingBookingDataRoute(
  request: Request, url: URL, listingSlug: string, groupSlug?: string,
) { … }
export type ListingBookingDataResult = ServerDataFrom<typeof loadListingBookingDataRoute>;
```

- [x] **Step 2: Rút 2 route module còn phần delegate** — gọi `loadListingBookingDataRoute(...)`.

- [x] **Step 3: Đổi 2 controller** sang `useFetcher<ListingBookingDataResult>()` import từ server module
(chỉ `import type`, hợp lệ).

- [x] **Step 4: Xử lý thêm dependency bị audit cũ bỏ sót** — loader payment status về
      `features/booking/server/booking-payment-status.server.ts`; route delegate, hook dùng result type.

- [x] **Step 5: Xác nhận sạch**

```bash
cd apps/storefront/app
grep -rn "~/routes/" features components --include="*.ts" --include="*.tsx" || echo "OK: features/components khong con import routes/"
```

---

# Phase 5 — Hàng rào (chặn tái phát) — **XONG 2026-07-28**

Đây là mục quan trọng nhất: dashboard giữ được convention *"enforced by review"*, storefront thì trôi.
ADR 0005 cấm test, nên hàng rào phải là ESLint + script gate — đúng cách repo đang làm với `apps/api`.

### Task 5.1: Boundary rule cho cả hai frontend — **XONG**

**Files:** Modify `eslint.config.mjs`

- [x] **Step 1: Thêm hai block boundary.** Block global cấm `+types` ngoài route/root đứng trước;
      block feature đứng sau và lặp cả hai pattern `routes` + `+types`. Đây là bắt buộc vì flat config
      **thay thế**, không merge hai giá trị cùng rule. Source of truth là `eslint.config.mjs`.

- [x] **Step 2: Chạy lint 2 app** — cả hai không có boundary violation.

```bash
pnpm --filter=@booking/storefront lint && pnpm --filter=@booking/dashboard lint
```

- [x] **Step 3: Chứng minh rule thật sự bắt** bằng `eslint --stdin --stdin-filename` — import giả bị
      từ chối; không tạo/sửa file source.

- [x] **Step 4: Commit** cùng Phase 5.

---

### Task 5.2: Bật `eslint-plugin-react-hooks` — **XONG**

App có ~25 controller hook mà không rule nào kiểm dependency array.

- [x] **Step 1: Cài**

```bash
pnpm add -Dw eslint-plugin-react-hooks
```

- [x] **Step 2: Thêm vào `eslint.config.mjs`**

```js
import reactHooks from 'eslint-plugin-react-hooks';
// …
  {
    files: ['apps/storefront/app/**/*.{ts,tsx}', 'apps/dashboard/app/**/*.{ts,tsx}', 'packages/ui/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
```

- [x] **Step 3: Chạy lint, ghi lại số warning**

```bash
pnpm --filter=@booking/storefront lint 2>&1 | tail -20
```
`rules-of-hooks` phải **0 error**. Nếu có error → dừng, báo lại: đó là bug thật, sửa trong task riêng.
`exhaustive-deps` để `warn` (không chặn CI) — sửa dần, **không** sửa trong phase này vì có thể đổi hành vi.

Kết quả thật: storefront **0 error / 3 warning** (`days` ×2, `durationSlots` ×1);
dashboard và `packages/ui` **0 error / 0 warning**.

- [x] **Step 4: Commit** cùng Phase 5.

---

### Task 5.3: Gate cấu trúc thư mục — **XONG, CHƯA NỐI CI**

**Files:** Create `scripts/architecture/check-frontend-structure.mjs`; Modify root `package.json`.

- [x] **Step 1: Viết script**

```js
// scripts/architecture/check-frontend-structure.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const APPS = ['apps/storefront', 'apps/dashboard'];
const BUCKETS = new Set(['routes', 'constants', 'components', 'features', 'hooks', 'lib']);
const ROOT_FILES = new Set(['root.tsx', 'routes.ts', 'app.css', 'entry.server.tsx', 'entry.client.tsx']);
const FEATURE_DIRS = new Set(['components', 'hooks', 'server', 'lib']);
const MAX_ROUTE_LINES = 120;
const failures = [];

function dirs(p) {
  return readdirSync(p).filter((e) => statSync(join(p, e)).isDirectory());
}
function files(p, out = []) {
  for (const e of readdirSync(p)) {
    const f = join(p, e);
    if (statSync(f).isDirectory()) files(f, out);
    else if (/\.tsx?$/.test(e)) out.push(f);
  }
  return out;
}

for (const app of APPS) {
  const appDir = join(root, app, 'app');

  // 1. chỉ 6 bucket + file gốc cho phép
  for (const entry of readdirSync(appDir)) {
    const full = join(appDir, entry);
    if (statSync(full).isDirectory()) {
      if (!BUCKETS.has(entry)) {
        failures.push(`${app}/app/${entry}/: bucket lạ — chỉ cho phép ${[...BUCKETS].join(', ')}`);
      }
    } else if (!ROOT_FILES.has(entry)) {
      failures.push(`${app}/app/${entry}: file gốc lạ — đưa vào một bucket`);
    }
  }

  // 2. features/<name>/ chỉ có components|hooks|server|lib làm thư mục con
  const featuresDir = join(appDir, 'features');
  for (const feature of dirs(featuresDir)) {
    for (const sub of dirs(join(featuresDir, feature))) {
      if (!FEATURE_DIRS.has(sub)) {
        failures.push(
          `${app}/app/features/${feature}/${sub}/: chỉ cho phép components/, hooks/, server/, lib/`,
        );
      }
    }
  }

  // 3. *.server.ts chỉ nằm trong lib/ hoặc features/*/server/
  for (const file of files(appDir)) {
    const rel = relative(join(root, app, 'app'), file).split('\\').join('/');
    if (!rel.includes('.server.')) continue;
    if (rel === 'entry.server.tsx') continue;
    const ok = rel.startsWith('lib/') || /^features\/[^/]+\/server\//.test(rel) || rel.startsWith('routes/');
    if (!ok) failures.push(`${app}/app/${rel}: *.server.ts phải ở lib/ hoặc features/<name>/server/`);
  }

  // 4. Storefront route module phải mỏng. Dashboard implementation còn nợ riêng;
  // convention dashboard là chuẩn tham chiếu nhưng chưa thể bật cùng gate trong phase này.
  if (app !== 'apps/storefront') continue;
  for (const file of files(join(appDir, 'routes'))) {
    const lines = readFileSync(file, 'utf8').split('\n').length;
    if (lines > MAX_ROUTE_LINES) {
      const rel = relative(root, file);
      failures.push(`${rel}: ${lines} dòng > ${MAX_ROUTE_LINES} — tách UI/loader sang features/`);
    }
  }
}

if (failures.length) {
  console.error('Frontend structure check failed:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log('Frontend structure check passed.');
```

> Bất biến #4 từng **đỏ** cho tới khi Phase 8 xong (`routes/bookings.tsx` 236 dòng). Phase 8 đã bổ sung
> semantic route-only checks để bắt support declaration/module và nối script vào CI.

- [x] **Step 2: Thêm npm script** vào root `package.json` (Phase 5 chưa nối; Phase 8 đã nối CI)

```json
"check:frontend-structure": "node scripts/architecture/check-frontend-structure.mjs"
```

- [x] **Step 3: Chạy `pnpm check:frontend-structure`.** Bất biến 1–3 **xanh** (Phase 2–3 đã dọn),
      LOC gate storefront đỏ ở `routes/bookings.tsx`. Ghi rõ trong commit message rằng Phase 8 còn
      semantic debt chưa được gate bắt.

- [x] **Step 4: Commit** cùng Phase 5; không nối CI trước Phase 8.

---

# Phase 6 — Gộp booking engine (mục 2 + 3)

**Bối cảnh (đã đọc code, không phải phỏng đoán):** `usePackageBookingDialogController` (190 dòng) là
**tập con thật sự** của `useListingBookingDialogController` (406 dòng) — nhánh `fixedPackages` trong
cái lớn (dòng 231-243) chính là toàn bộ logic toggle-1-slot của cái nhỏ. 4 điểm khác cần giữ:

| | listing dialog | package dialog |
|---|---|---|
| open state | tự giữ `desktopOpen`/`mobileOpen` + trigger riêng | do cha điều khiển (`open`/`onOpenChange`/`returnFocusRef`) |
| availability | không cache | `cachedAvailability` — tránh nháy picker lúc gọi quote |
| error | một cờ `requestError` | tách `availabilityError` / `quoteError` |
| mode | hourly + daily | chỉ hourly |

> **UI: không đổi.** Bản gộp phải giữ nguyên `cachedAvailability` và error tách đôi (đây là hành vi tốt
> hơn, và bỏ đi sẽ làm picker nháy → đổi UI). Bản listing sẽ *thêm* 2 thứ này, không bỏ gì.

### Task 6.1: Gộp shell — **XONG (`33a3ed6a`)**

- [x] **Step 1: Tạo `features/booking-widget/components/booking-dialog-shell.tsx`** — lấy
`RoomBookingDialogShell` làm gốc (nó có `trigger`, cái kia không), thêm prop tuỳ chọn
`controlled?: { open: boolean; onOpenChange: (o: boolean) => void }`. **Giữ nguyên 100% className và
cây DOM của `RoomBookingDialogShell`** (`h-[min(90dvh,48rem)]`, `sm:max-w-146`, `h-[92dvh]`,
`absolute top-3 right-3 size-11`, `aria-label={t('group.closeSchedule')}`).

  **Kết quả runtime và ngoại lệ đã duyệt:** listing giữ CSS branch. Controlled packages không thể mount
  đồng thời hai primitive bằng CSS vì `DialogContent`/`DrawerContent` portal vào `body`; cùng một
  `open` tạo 2 overlay + 2 focus trap. Packages vì vậy dùng JS để chỉ mount đúng một primitive.

- [x] **Step 2: Trỏ `PackageBookingDialog` sang shell mới**, xoá
`package-booking-dialog-shell.tsx` + `use-package-booking-dialog-shell-controller.ts`.

- [x] **Step 3: Chạy app, mở dialog packages ở cả desktop và mobile width, đối chiếu với `git stash`
      bản cũ.** Verify + Commit.

### Task 6.2: Gộp controller — **XONG (`7c96aa1d`)**

- [x] **Step 1:** Đưa `cachedAvailability` + tách `availabilityError`/`quoteError` vào
`useListingBookingDialogController`, đổi tên file →
`features/booking-widget/hooks/use-booking-dialog-controller.ts`.
- [x] **Step 2:** Thêm prop `controlled` + `returnFocusRef` tuỳ chọn.
- [x] **Step 3:** `PackageBookingDialog` gọi controller chung với `mode: 'hourly'` cố định;
xoá `use-package-booking-dialog-controller.ts`.
- [x] **Step 4:** Chạy thử **cả 3 luồng**: listing hourly, listing daily, packages. Verify + Commit.

### Task 6.3: Gộp steps + slot picker — **XONG (`7aee924f`)**

- [x] **Step 1:** `package-booking-dialog-steps.tsx` (162 dòng) là bản rút gọn của
`room-booking-dialog-steps.tsx` (344 dòng) — đưa về một file
`features/booking-widget/components/booking-dialog-steps.tsx`, phần daily/mode-switch render có điều kiện.
- [x] **Step 2:** Move `slot-picker.tsx` → `features/booking-widget/components/`.
- [x] **Step 3:** Move `listing-group-utils.ts` → `features/booking-widget/lib/slot-selection.ts`.
- [x] **Step 4: Nâng 2 file thành dùng chung.** Sau khi steps/dialog rời sang `booking-widget`, hai file
      này bị dùng bởi 2 feature → theo luật `components/` = primitive đa-feature:
      - `features/packages/components/package-media-details.tsx` → `components/package-media-details.tsx`
        (dùng bởi `packages/{package-albums,package-table}` **và** `booking-widget/booking-dialog`)
      - `features/listing-group/components/room-photo-strip.tsx` → `components/room-photo-strip.tsx`
        (dùng bởi `listing-group/room-options-section` **và** `booking-widget/booking-dialog-steps`)
- [x] **Step 5: Xác nhận không còn import chéo feature**

```bash
cd apps/storefront/app
grep -rn "~/features/" features --include="*.ts" --include="*.tsx" \
  | awk -F: '{print $1" -> "$3}' | grep -vE "^features/([a-z-]+)/.*~/features/\1/" || echo "OK"
```
Mọi dòng còn lại phải giải thích được (feature A dùng *type* của feature B là chấp nhận; dùng
*component* của nhau thì component đó phải lên `components/`).

- [x] **Step 6:** Verify + Commit.

---

# Phase 7 — Gộp page shell (mục 4) — **XONG (`494ffcc0`)**

3 trang đã drift; gộp thì phải chọn một bản chuẩn:

| Điểm drift | listing | listing-group | packages | Chọn | Trang bị đổi |
|---|---|---|---|---|---|
| nền | `bg-muted/30` | `bg-muted/30` | `bg-muted/40` | `bg-muted/30` | **packages nhạt đi** |
| padding dọc | `py-4` | `py-4` | `py-6` | `py-4` | **packages sát hơn 8px** |
| icon MapPin | `size-4` | `size-4` | `size-5` | `size-4` | **packages icon nhỏ lại** |
| landmark | `<div>` | `<div>` | `<main>` | `<main>` | listing + group thêm landmark (**không đổi hình**) |
| reviews | defer Suspense | eager | defer Suspense | **giữ nguyên mỗi trang** | không đổi |

- [x] **Step 0: Duyệt 3 thay đổi pixel ở trang packages** — chủ dự án đã đồng ý 2026-07-28 ("gộp lại đi
      để gọn code"). Tiến hành.
- [x] **Step 1: Tạo `components/detail-page-layout.tsx`**

```tsx
export function DetailPageLayout({ searchBar, header, gallery, main, aside, footerSections }: {
  searchBar: ReactNode; header: ReactNode; gallery: ReactNode;
  main: ReactNode; aside: ReactNode; footerSections?: ReactNode;
}) {
  return (
    <div className="font-studio overflow-x-clip bg-muted/30 pb-20 text-foreground">
      {searchBar}
      <main className="mx-auto flex max-w-292.5 flex-col gap-4 px-4 py-4 xl:px-0">
        <SectionCard>{header}{gallery}</SectionCard>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,870px)_284px]">
          <div className="flex min-w-0 flex-col gap-4">{main}</div>
          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">{aside}</aside>
        </div>
        {footerSections}
      </main>
    </div>
  );
}
```

- [x] **Step 2: Tạo `components/detail-price-card.tsx`** — price-card ở aside của listing-group và
packages đang giống hệt nhau (`rounded-lg bg-card p-5 text-right text-card-foreground shadow-sm`).
- [x] **Step 3: Sửa lần lượt 3 page dùng layout mới.** Verify + chạy app + so 3 trang với bản cũ.
- [x] **Step 4: Commit** (`refactor(storefront): extract shared detail page layout`)

---

# Phase 8 — `routes/` chỉ còn route module (mục 5, audit mở rộng 2026-07-28)

**Convention đã chốt:** lấy rule được ghi trong `apps/dashboard/CLAUDE.md` làm chuẩn, không copy nợ
route béo đang tồn tại trong code dashboard. File được đăng ký bởi `app/routes.ts` chỉ chứa các export
React Router (`default`, loader/action variants, middleware variants, `meta`, `links`, `headers`,
`handle`, `shouldRevalidate`, `ErrorBoundary`, `HydrateFallback`) dưới dạng adapter mỏng.
UI/helper/handler/constants/response builder thuộc owner feature. Storefront không có `nav.ts` hay
area-local `routes.ts`, nên không có support-file exception trong `routes/`.

Audit thật sau Phase 4: **65 route file; 10 file có 21 top-level support declaration; 1 non-route
support module; 11 route→route import ngoài `+types`**. Danh sách 3 file của plan cũ là thiếu.

- [x] **Task 8.1 — booking lookup (`3057b70f`):** `routes/bookings.tsx` → UI (`Bookings`, `RequestForm`,
      `RecentList`) vào `features/booking/components/bookings-lookup-page.tsx`; loader/action body vào
      `features/booking/server/bookings-route.server.ts`. Route chỉ delegate `meta/loader/action/default`.
- [x] **Task 8.2 — inline page UI (`0f2253ea`):** tách nguyên JSX, không sửa className/copy:
      - `routes/community.tsx` → `features/community/components/community-page.tsx`;
      - `routes/account/help.tsx` → `features/account/components/help/help-page.tsx`;
      - `routes/account/{security,terms}.tsx` → `features/account/components/legal/`;
      - `routes/partner-onboarding/done.tsx` → feature component;
      - `TenantHome` trong `routes/home.tsx` → `features/home/components/tenant-home.tsx`.
- [x] **Task 8.3 — route-local pure/support logic (`589f3b9c`):**
      - `EMPTY_REFS` + `needsFavoriteRefs` trong `locale-layout.tsx` → `features/favorites/lib/`;
      - `legacy/redirect.server.ts` → `features/root/server/legacy-redirect.server.ts`, sửa 10 legacy
        route import và xoá support module khỏi `routes/`;
      - thân `set-locale` action → `features/root/server/set-locale-route.server.ts`.
- [x] **Task 8.4 — resource/operational handlers (`b5a9b4cd`):**
      - `favorites-toggle` → `features/favorites/server/favorites-toggle-route.server.ts`;
      - `sitemap.xml` + XML/pagination helpers → `features/seo/server/sitemap-route.server.ts`;
      - hai upload presign action + JSON response helper → `features/storage/server/`;
      - readiness timeout/backend probe → `lib/readiness.server.ts`.
      Các route resource còn đúng một adapter export, không tạo default component giả.
- [x] **Task 8.5 — xoá route coupling:** không còn import route→route ngoài relative `./+types/*`;
      `account/help` lấy context type trực tiếp từ feature, legacy route lấy redirect handler từ feature.
      Verification-only: hai coupling đã rời route trong 8.2/8.3, không tạo empty commit.
- [x] **Task 8.6 — gate và CI (`15e33f03`):** mở rộng `check:frontend-structure` để storefront `routes/`:
      - không chứa file support ngoài các module được route config đăng ký;
      - không có top-level support declaration ngoài danh sách React Router export;
      - route giữ dưới ngưỡng LOC đã chốt.
      Chạy gate xanh rồi mới nối `pnpm check:frontend-structure` vào CI, `AGENTS.md` và full static check.
      Route-only gate tạm chỉ áp storefront; dashboard có audit/refactor riêng vì code hiện tại còn
      40/85 route file với 77 helper/constant dù convention doc đã đúng.

**Kết quả Phase 8:** gate xanh với 64/64 route module, route dài nhất 60 dòng; 0 support module,
0 top-level support declaration và 0 route→route import ngoài `./+types/*`. Gate đã nối CI.

Mỗi task: copy/move nguyên logic → rewrite import → scoped format → typecheck/build/lint/security →
commit. **Không sửa className, DOM, copy, request contract, URL hay thứ tự side effect.**

---

# Phase 9 — i18n (mục 6)

- [x] **Task 9.1 (`7e1986a3`): `features/provider/components/provider-profile-page.tsx`** — 9 chuỗi
      `en ? 'Verified' : 'Đã xác minh'` → key trong namespace `catalog` (hoặc ns mới `provider`).
      Chuỗi tiếng Việt/Anh giữ **nguyên văn** → không đổi UI.
- [x] **Task 9.2 (`6542f03b`):** `features/account/lib/booking-history.ts` (3), `components/review-time.tsx`,
      `lib/api-result.server.ts` (4 chuỗi lỗi), `lib/tenant-availability.ts`,
      `features/listing-group/lib/listing-group-meta.ts` (`'Bài đăng'`), 2 file structured-data (`'Trang chủ'`).
- [x] **Task 9.3 (`89de1986`): meta hardcode** — `routes/bookings.tsx` `'Bookings'`, `routes/community.tsx`
      `'Community | BookingOS'`, `routes/provider.tsx` `'Provider'` + `` `${name} trên BookingOS` ``.
- [x] **Task 9.4 (`70079792`): ErrorBoundary** — tạo
      `components/storefront-route-error-boundary.tsx` bọc `RouteErrorState`,
      luôn lấy `homeLabel` từ `t('errors.home')`. Thay 6 chỗ lặp. Xoá hardcode `"Về trang chủ"`
      và ternary ở route provider. Riêng booking-detail giữ đích về trang tra cứu và dùng
      `navigation.lookup`, không đổi hành vi.
- [x] **Task 9.5 (`58c75ba8`): Xoá 39 key mồ côi × 2 locale = 78 entry.** Danh sách đã verify (0 hit trong storefront,
      dashboard, packages/ui):
      `common`: `becomePartner.{accountSection,partnerSection,licenseSection,slugHint,licenseNo,licenseDoc,district,addLicenseDoc,removeLicenseDoc}`, `currencyNote`, `home.{viewAll,heroTagline}`, `footer.{downloadApp,scrollToTop}` ·
      `errors`: `{localeNotFound,listingNotFound,catalogNotFound}` ·
      `listing`: `{providedBy,addToFavorites,descriptionTitle}`, `group.{saveComingSoon,viewProviderComingSoon,viewRoomDescription}` ·
      `catalog`: `{typeNotFound,loadingResults,matchingRooms}` ·
      `booking`: `{cancelReason,cancelConfirm,refundInfo}` ·
      `account`: `profile.passwordHint`, `bookings.{timeAndDuration,orderBreakdown}`, `bookings.reviewSection.uploadOr`, `reviews.quickFilter` ·
      `platform`: `hero.{visualCaption,visualMeta}`, `pricing.pendingTitle`, `footer.{solutionsTitle,supportTitle}`
      Xoá cả `vi/` lẫn `en/`. Typecheck của `translation-shape.ts` sẽ bắt nếu lệch giữa 2 locale.

**Kết quả Phase 9:** toàn bộ copy/meta/error-boundary trong scope dùng typed i18n; 6 route
ErrorBoundary delegate về một component chung; 39 key chết đã rời cả hai locale. Full gate storefront
15/15, security, structure và no-tests đều xanh.

---

# Phase 10 — `params.locale === 'en' ? 'en' : 'vi'` × 27 (mục 7)

- [x] **Step 1 (`fdc017ad`): Thêm vào `constants/paths.ts`**

```ts
export function localeParam(value: string | undefined): Locale {
  return value === 'en' ? 'en' : 'vi';
}
```

- [x] **Step 2 (`fdc017ad`): Thay 27 chỗ ở 19 file** bằng `localeParam(...)`.
      Audit cũ có 18 file; `components/storefront-route-error-boundary.tsx` được thêm ở Phase 9 là
      consumer thứ 19. `hooks/use-locale.ts`, `lib/tenant-availability.ts`,
      `lib/request-security.server.ts`, `root.tsx` và account booking-detail page cũng dùng chung hàm.
- [x] **Step 3: Xác nhận** — `grep -rn "=== 'en' ? 'en' : 'vi'" app` chỉ còn 1 hit trong
      `localeParam`; toàn app có đúng 27 call site.
- [x] **Step 4: Verify + Commit (`fdc017ad`)** — Turbo storefront 15/15, security,
      `check:frontend-structure`, `check:no-tests` đều xanh; React Doctor 20 file đạt 100/100.

**Kết quả Phase 10:** normalization locale có một source of truth typed, mọi input khác `en` vẫn
fallback về `vi`; không đổi route params, URL, loader/action contract hay UI.

---

# Phase 11 — Dead code + mock data (mục 8 + 9)

- [x] **Task 11.1 (`b6faf932`): Xoá `customer-settlement-dispute-panel`** — không file nào import.

```bash
git rm apps/storefront/app/features/account/components/booking-detail/customer-settlement-dispute-panel.tsx \
       apps/storefront/app/features/account/hooks/use-customer-settlement-dispute-panel-controller.ts
```
Xoá kèm key `account.bookings.disputePanel.*` ở cả 2 locale.

### Task 11.2 (`ab73b222`): Gỡ sạch mock data — **ĐÃ CHỐT 2026-07-28: "remove mock đi, đưa về tiêu chuẩn"**

> **UI production KHÔNG đổi.** `accountMocksEnabled()` = `!production`, nên prod xưa nay đã chạy đúng
> nhánh không-mock. Task này biến nhánh đó thành nhánh **duy nhất**. Chỉ môi trường dev mất dữ liệu giả —
> đó chính là mục tiêu.

**Files:**
- Delete: `features/account/server/mock-data.server.ts`, `features/account/server/account-listings.server.ts`,
  `features/account/server/account-messages-route.server.ts`,
  `features/account/hooks/use-account-messages-page-controller.ts`
- Modify: `features/account/components/messages/account-messages-page.tsx`,
  `features/account/components/shared/account-primitives.tsx`,
  `features/account/server/account-recent-route.server.ts`, `routes/account/{messages,recent}.tsx`
- Modify: `packages/i18n/src/locales/{vi,en}/account.ts`

- [x] **Step 1: Xoá `mock-data.server.ts`.** Chú ý `mockListings()` trong đó là **dead export** — không
      file nào import. `mockConversations()` chỉ phục vụ messages. `accountMocksEnabled()` chỉ có 2 chỗ gọi.

- [x] **Step 2: `/account/messages` → trạng thái "chưa khả dụng" cố định.** Không có backend messages,
      nên toàn bộ UI chat (~110 dòng: danh sách hội thoại, khung tin nhắn, form gửi) là code không bao giờ
      render được trong prod. Giữ lại đúng phần prod đang hiển thị:

```tsx
// features/account/messages/components/account-messages-page.tsx — TOÀN BỘ file sau khi sửa
import { NsI18n, useTranslation } from '~/lib/i18n';
import { FeatureUnavailableState, PageHeading } from '~/features/account/components/account-primitives';

export function AccountMessagesPage() {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <div className="space-y-4">
      <PageHeading title={t('messages.title')} />
      <FeatureUnavailableState />
    </div>
  );
}
```
Xoá `use-account-messages-page-controller.ts` và `account-messages-route.server.ts`;
`routes/account/messages.tsx` bỏ `loader`, chỉ còn `export default`.

- [x] **Step 3: `account-primitives.tsx`** — đổi tên `MockDisabledState` → `FeatureUnavailableState`
      (**giữ nguyên 100% JSX/className**, chỉ đổi tên hàm); xoá `DemoNotice` và prop `demo` của
      `PageHeading` (cả hai chỉ mock mới dùng).

- [x] **Step 4: `/account/recent`** — `loadAccountListingItems` lấy listing thật từ `loadHomeCatalog` rồi
      **bịa** `discountPercent: 20` qua `PRESENTATION_FIXTURES`. Xoá `account-listings.server.ts`;
      `loadAccountRecentRoute` trả `{ locale, items: [] }`. Trang đã sẵn nhánh rỗng
      (`visibleItems.length > 0 ? … : …`) nên không cần sửa UI.

- [x] **Step 5: i18n** — đổi key `account.mockDisabled` → `account.featureUnavailable` (**giữ nguyên
      chuỗi**, cả `vi` lẫn `en`); xoá `account.demo`, `account.demoDescription` và ba key chat vừa
      thành dead sau khi xoá UI: `messages.{search,reply,send}`.

- [x] **Step 6: Xác nhận sạch**

```bash
cd apps/storefront/app
rg "accountMocksEnabled|mockConversations|mockListings|MockDisabledState|DemoNotice|PRESENTATION_FIXTURES" \
  features/account
```

Lệnh `grep "mock|Mock"` rộng trong plan cũ báo dương tính giả ở `isMockPaymentRedirect`. Helper này
là adapter dev-only cho payment gateway, được dùng bởi ba flow checkout/booking, bị cấm trong
production và không liên quan presentation mock của account nên phải giữ.

- [x] **Step 7: Verify + Commit (`ab73b222`)**
      (`refactor(storefront): remove account mock data and demo scaffolding`)

**Kết quả Phase 11:** xoá 608 dòng dead/mock scaffolding qua hai commit; production-state UI của
messages và recent trở thành nhánh duy nhất. Turbo storefront 15/15, security, structure và no-tests
đều xanh.

---

# Phase 12 — Tách god file (mục 10)

`features/platform-landing/components/platform-sections.tsx` — 721 dòng, 11 public section export + 5 helper
+ 5 bảng const.

- [x] **Step 1: Move 5 bảng const** (`SERVICE_MODELS`, `BEFORE_ITEMS`, `AFTER_ITEMS`, `TRUST_ITEMS`,
      `FAQ_ITEMS`) → `features/platform-landing/lib/platform-content.ts`.
- [x] **Step 2: Tách một file / một section** trong `features/platform-landing/components/sections/`:
      `platform-hero.tsx` (kèm `SchedulePreview`), `service-models-section.tsx`,
      `transformation-section.tsx` (kèm `TransformationList`), `capabilities-section.tsx` (kèm `CapabilityRow`),
      `workflow-section.tsx`, `demos-section.tsx` (kèm `DemoFigure`), `pricing-section.tsx`,
      `trust-section.tsx`, `faq-section.tsx`, `consultation-section.tsx`,
      `platform-footer.tsx` (kèm `FooterGroup`).
- [x] **Step 3: `platform-sections.tsx` trở thành barrel** `export * from './sections/…'` — bên gọi
      (`platform-landing.tsx`) không phải đổi.
- [x] **Step 4: Cắt-dán nguyên xi, không sửa JSX.** Verify + chạy landing ở host chưa map tenant +
      Commit (`aaef444f` — `refactor(storefront): split platform landing sections`).

**Kết quả Phase 12:** barrel còn 11 dòng; 11 section công khai nằm trong 11 file owner, 5 helper vẫn
private cạnh section sử dụng chúng, 5 bảng content ở `lib/platform-content.ts`. Không đổi consumer,
JSX/className/copy/thứ tự render. Turbo storefront 15/15, security, structure và no-tests xanh; React
Doctor trên diff so với `HEAD` đạt 100/100. Host chưa map tenant trả HTTP 200 và SSR đủ các section
anchor chính.

---

# Phase 13 — Chốt tài liệu

- [x] **Task 13.1: Viết lại `apps/storefront/CLAUDE.md`** phần cấu trúc — copy khung của
      `apps/dashboard/CLAUDE.md` §"Folder architecture" + §"Import discipline", ghi rõ phần storefront
      khác: multi-tenant theo `Host`, song ngữ `/:locale`, `lib/theme.ts` xử lý theme tenant (untrusted).
      Commit `9215ecfa`.
- [x] **Task 13.2: `docs/conventions.md` §Frontend** — thêm mục "Bố cục app frontend" nói **cả hai** app
      dùng chung 6 bucket + `~/`, và ESLint/`check:frontend-structure` đang giữ luật. Commit `0817a899`.
- [x] **Task 13.3: `AGENTS.md`** — verification-only: `pnpm check:frontend-structure` đã được thêm vào
      bảng lệnh, chuỗi "Full static check" và mô tả CI từ Phase 8 (`15e33f03`), nên không tạo thay đổi
      trùng lặp.
- [x] **Task 13.4: Chạy full static check của repo**

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
```

**Kết quả Phase 13:** full static check xanh ngày 2026-07-28: no-tests, module cycles (17 modules),
frontend structure, storefront security, Turbo **24/24**, và RLS **46/46**. Storefront còn đúng 3
warning hook đã ghi nhận; sourcemap messages của raw `packages/ui` không làm build fail. Cả 13 phase
hoàn tất.

**Correction sau review (`df1090cb`):** audit Phase 3 trước đó chỉ quét
`features/*/components`, bỏ sót ba controller hook file và một exported hook trong top-level
`app/components`. Cả bốn đã chuyển sang `app/hooks`; structure gate nay chặn file `use-*` và exported
hook trong shared components, đồng thời chặn tương tự trong feature components của storefront. Probe
cố ý đã xác nhận gate đỏ đúng lý do; tree thật đạt React Doctor 100/100 và full static check lần cuối
đạt Turbo 24/24, module graph 17 modules, RLS 46/46.

---

## Quyết định đã chốt (2026-07-28)

1. **Phase 7** — DUYỆT gộp page shell, chấp nhận 3 thay đổi pixel ở trang packages.
2. **Phase 11.2** — DUYỆT gỡ sạch mock, đưa về trạng thái tiêu chuẩn (prod UI không đổi).
3. **Phase 6.1** — listing giữ CSS branch; controlled packages dùng JS chọn đúng một primitive vì
   Dialog/Drawer portal. Ngoại lệ đã duyệt sau khi runtime chứng minh CSS mount song song tạo 2 overlay
   + 2 focus trap.

## Thứ tự KHÔNG được đảo

Phase 1 (alias) phải trước mọi phase move — nếu không, mỗi lần `git mv` sẽ phải sửa cả import nội bộ
của file bị move lẫn của bên gọi. Phase 4 (cắt `features→routes`) phải trước Phase 5 (bật rule), nếu
không lint đỏ hàng loạt và không phân biệt được lỗi mới với nợ cũ.
