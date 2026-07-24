# PR #4 — Favorite aggregate (favorites) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Module favorites (gần-CRUD, nhỏ nhất trong 16) chuyển write-path sang `Favorite` aggregate:
rule XOR target và "chỉ target đã published mới thả tim được" rời khỏi repository, 4 khối
`TENANT_NOT_FOUND` copy-paste dùng chung `TenantNotFound`, port fat được tách reader. Wire
byte-identical.

**Architecture:** Theo spec
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
(§3 + style-gate đã ratify) và khảo sát
[`entity-centric-survey.md`](../../refactor/entity-centric-survey.md) mục favorites. Module không có
vòng đời trạng thái (tim tồn tại hoặc không) nên aggregate mỏng: một factory `Favorite.open()` dựng
state XOR đúng-theo-cấu-trúc. Idempotency (thêm trùng / xoá không có) **giữ nguyên ở tầng DB**:
partial unique index + P2002 swallow + `deleteMany` — luật CAS ở lại repo.

**Tech Stack:** NestJS 11, Prisma (RLS), zod contracts, pnpm 10.13.1, Node 22.22.0.

## Global Constraints

- **KHÔNG test** (ADR 0005); verify = `typecheck` + `lint` + `build` + chạy app.
- **ADR 0006**: không service class; 1 use-case = 1 file, 1 `execute()`.
- **Wire byte-identical**: `TENANT_NOT_FOUND`/404/'Tenant not found';
  `FAVORITE_TARGET_NOT_FOUND`/404/'Listing or group not found'; response toggle
  `{ ...target, favorited: true|false }` — cả 2 chiều giữ nguyên từng byte.
- **Idempotency ở lại DB (luật CAS)**: `add` giữ `try/catch P2002 → return` (partial unique index là
  trọng tài thật, chỉ tồn tại trong SQL migration chứ KHÔNG có trong `schema.prisma`); `remove` giữ
  `deleteMany`. **Tuyệt đối không** thay bằng "check `isFavorited` rồi mới create" — đó là TOCTOU.
- **`createdAt` do DB cấp** (`DEFAULT CURRENT_TIMESTAMP`): factory KHÔNG được stamp `new Date()`.
- **Không đụng schema/migration**: XOR được bảo chứng bởi CHECK `favorites_one_target_check`; entity
  chỉ dựng đúng cặp cột, không thay thế constraint.
- **Host→tenant resolution ở NGOÀI tx, trên admin pool** (`prisma-favorite-tenant.reader.ts`, có
  verified-domain + tenant active): không đụng, không gộp vào `forTenant`, không nới where-clause.
- **`resolveTargetPartnerId` chạy TRONG tenant tx dưới RLS**: giữ nguyên vị trí — đẩy ra pre-tx trên
  admin pool sẽ lộ tồn tại listing xuyên tenant.
- **Read-side đóng băng**: 5 use-case đọc, `listRefs`/`listCustomer`/`listDashboard`/`summary`,
  mapper, controllers, DTO — chỉ đổi đường import khi type dời file, không đổi logic. Đặc biệt
  KHÔNG đụng `toVnd`/`priceFromModeConfig` trong repo (trùng lặp với catalog — đã ghi sổ follow-up,
  sửa ở PR khác).
- **Dead code xoá trong PR này** (spec §4): `isFavorited` — khai báo ở port + implement ở repo,
  **0 caller** trong toàn `apps/api/src` (đã grep).
- Domain framework-free (chỉ `import type` từ `@booking/contracts`). Style-gate: defensive branch
  dùng `Error` thường; mã lỗi wire dùng chung đặt ở `shared/domain/errors/`.
- **Port tách khi fat** (rule đã ratify): port hiện trộn 6 read record type + 4 read method với 3
  write method → tách `FAVORITE_READER`. Một class Prisma implement cả 2 port ⇒ bind bằng **bộ ba
  `useExisting`** (pattern đã codify trong spec §3 từ PR #2).
- Node **22.22.0** (`nvm use`), chỉ **pnpm**. Không đụng container/process project khác
  (`kaigo-postgres-dev`, `cf-connect-be`); smoke dùng `PORT=3001` nếu 3000 bận.
- Branch **`refactor/entity-favorites`** (từ `refactor/entity-centric`), PR vào
  `refactor/entity-centric`.

---

### Task 1: Branch + domain — errors + Favorite aggregate

**Files:**
- Create: `apps/api/src/modules/favorites/domain/errors/favorite-errors.ts`
- Create: `apps/api/src/modules/favorites/domain/entities/favorite.entity.ts`

**Interfaces:**
- Consumes: `DomainError` (shared kernel).
- Produces (Task 2 dùng đúng tên này): `FavoriteTargetNotFound()`; interfaces `FavoritableTarget
  { target: FavoriteTargetKind; targetId: string; partnerId: string }`, `NewFavorite { tenantId;
  customerId; partnerId; listingId: string | null; groupId: string | null }`; class `Favorite` với
  `static open({ tenantId, customerId, target }): NewFavorite`.

- [ ] **Step 1: Tạo branch**

```bash
cd "/Volumes/OVEN Duy/temp/booking-saas"
git checkout refactor/entity-centric && git pull origin refactor/entity-centric
git checkout -b refactor/entity-favorites
```

- [ ] **Step 2: Viết `domain/errors/favorite-errors.ts`**

```ts
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the Favorite aggregate. Code + status + message are byte-identical
 * to the pre-refactor use-case behaviour (wire frozen). `TENANT_NOT_FOUND` is NOT
 * re-minted here — it is the shared-kernel `TenantNotFound` (style-gate 2026-07-23).
 */

/** The hearted listing/group does not exist, or is not published. */
export class FavoriteTargetNotFound extends DomainError {
  constructor() {
    super('FAVORITE_TARGET_NOT_FOUND', 404, 'Listing or group not found');
  }
}
```

- [ ] **Step 3: Viết `domain/entities/favorite.entity.ts`**

```ts
import type { FavoriteTargetKind } from '@booking/contracts';

/**
 * Favorite aggregate root — one customer's heart on exactly one storefront target
 * (a published listing XOR a published listing group) inside one tenant.
 *
 * There is no lifecycle to model: a heart either exists or it does not, and both
 * transitions are idempotent. So the aggregate owns exactly one thing — assembling a
 * valid new favorite:
 *   - the XOR target shaping (`listingId` XOR `groupId`) that used to be a pair of
 *     ternaries inside the repository;
 *   - the denormalized `partnerId`, a CREATION-TIME snapshot of the target's owner
 *     (never re-validated later — a listing that changes hands does not invalidate
 *     existing hearts).
 *
 * NOT owned here (deliberately):
 *   - "the target must exist and be published": resolved by the repository's
 *     RLS-scoped ACL read, which hands back a {@link FavoritableTarget} only when the
 *     rule holds — the aggregate cannot see other modules' tables;
 *   - idempotency: the partial unique indexes + the P2002 swallow in the repository are
 *     the real arbiter (a domain-side pre-check would be TOCTOU);
 *   - `createdAt`: the DB clock stamps it (`DEFAULT CURRENT_TIMESTAMP`);
 *   - the XOR constraint itself: `favorites_one_target_check` in SQL stays the backstop —
 *     this factory just cannot produce a row that violates it.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** A target that passed the repository's exists-and-published check, with its owner. */
export interface FavoritableTarget {
  target: FavoriteTargetKind;
  targetId: string;
  partnerId: string;
}

/** Validated insert payload for a new heart (id/createdAt assigned by the DB). */
export interface NewFavorite {
  tenantId: string;
  customerId: string;
  partnerId: string;
  listingId: string | null;
  groupId: string | null;
}

export class Favorite {
  private constructor() {}

  /** Assemble a new heart from a favoritable target — XOR holds by construction. */
  static open(input: {
    tenantId: string;
    customerId: string;
    target: FavoritableTarget;
  }): NewFavorite {
    const { target } = input;
    return {
      tenantId: input.tenantId,
      customerId: input.customerId,
      partnerId: target.partnerId,
      listingId: target.target === 'listing' ? target.targetId : null,
      groupId: target.target === 'group' ? target.targetId : null,
    };
  }
}
```

- [ ] **Step 4: Typecheck** — `pnpm --filter=@booking/api typecheck`, expect exit 0.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/favorites/domain
git commit -m "feat(favorites): Favorite aggregate + domain error

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Write-path swap + tách reader port + dùng shared TenantNotFound

**Files:**
- Create: `apps/api/src/modules/favorites/domain/ports/favorite-reader.port.ts`
- Rewrite: `apps/api/src/modules/favorites/domain/ports/favorite-repository.port.ts`
- Modify: `apps/api/src/modules/favorites/infrastructure/repositories/prisma-favorite.repository.ts`
- Rewrite: `apps/api/src/modules/favorites/application/use-cases/add-favorite.use-case.ts`
- Modify: `apps/api/src/modules/favorites/application/use-cases/remove-favorite.use-case.ts`
- Modify: 4 use-case đọc (`list-favorite-refs`, `list-customer-favorites`, `list-partner-favorites`,
  `list-tenant-favorites`) + `favorites-summary.use-case.ts` → dùng reader port (và shared
  `TenantNotFound` ở 2 cái có resolve host)
- Modify: `apps/api/src/modules/favorites/application/favorite.mapper.ts:8-14` (import record từ reader port)
- Modify: `apps/api/src/modules/favorites/infrastructure/http/favorites.module.ts`

**Interfaces:**
- Consumes: mọi tên từ Task 1 + `TenantNotFound` (`shared/domain/errors/tenant-not-found`).
- Produces: `CONTENT`-style split — token mới `FAVORITE_READER` + `IFavoriteReader { listRefs,
  listCustomer, listDashboard, summary }` mang nguyên 6 record type (chỉ DỜI file); write port
  `IFavoriteRepository { findFavoritableTarget(tx, target): Promise<FavoritableTarget | null>;
  add(tx, favorite: NewFavorite): Promise<void>; remove(tx, customerId, target): Promise<void> }`.
  Token `FAVORITE_REPOSITORY` giữ nguyên. `isFavorited` bị xoá khỏi cả port lẫn repo.

- [ ] **Step 1: Viết `domain/ports/favorite-reader.port.ts`**

Chuyển nguyên xi 6 interface đọc từ `favorite-repository.port.ts` (không sửa một field nào) + 4
method đọc:

```ts
import type { PartnerFavoritesQuery, TenantFavoritesQuery } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const FAVORITE_READER = Symbol('FAVORITE_READER');

/** A favorited target shaped for a storefront listing card (mirrors PublicListingResponse). */
export interface FavoriteCardRecord {
  id: string;
  kind: 'listing' | 'group';
  title: string;
  slug: string;
  listingTypeSlug: string;
  attributes: Record<string, unknown>;
  photos: unknown[];
  priceFrom: string | null;
  itemLabel: string | null;
  ratingAvg: number | null;
  reviewCount: number;
  provinceCode: string | null;
  provinceName: string | null;
  wardCode: string | null;
  wardName: string | null;
  address: string | null;
}

export interface CustomerFavoritePage {
  items: FavoriteCardRecord[];
  total: number;
}

/** One "who favorited" row for the partner/tenant dashboard. */
export interface FavoriteEntryRecord {
  id: string;
  customerName: string;
  target: 'listing' | 'group';
  targetId: string;
  targetTitle: string;
  targetSlug: string;
  createdAt: Date;
}

export interface FavoriteListPage {
  items: FavoriteEntryRecord[];
  total: number;
  counts: { all: number; listing: number; group: number };
}

export interface FavoriteSummaryTargetRecord {
  target: 'listing' | 'group';
  targetId: string;
  title: string;
  slug: string;
  count: number;
}

export interface FavoriteSummaryRecord {
  total: number;
  uniqueCustomers: number;
  topTargets: FavoriteSummaryTargetRecord[];
}

export interface IFavoriteReader {
  listRefs(tx: PrismaTx, customerId: string): Promise<{ listingIds: string[]; groupIds: string[] }>;
  listCustomer(
    tx: PrismaTx,
    customerId: string,
    query: { page: number; pageSize: number },
  ): Promise<CustomerFavoritePage>;
  listDashboard(
    tx: PrismaTx,
    query: PartnerFavoritesQuery | TenantFavoritesQuery,
    partnerId?: string,
  ): Promise<FavoriteListPage>;
  summary(tx: PrismaTx, partnerId?: string): Promise<FavoriteSummaryRecord>;
}
```

- [ ] **Step 2: Viết lại `domain/ports/favorite-repository.port.ts`** (toàn bộ file)

```ts
import type { FavoriteTarget } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { FavoritableTarget, NewFavorite } from '../entities/favorite.entity';

export const FAVORITE_REPOSITORY = Symbol('FAVORITE_REPOSITORY');

export interface IFavoriteRepository {
  /**
   * The target's owner, but only when the target exists AND is published — the
   * storefront rule, resolved inside the tenant tx under RLS. `null` = not favoritable.
   */
  findFavoritableTarget(tx: PrismaTx, target: FavoriteTarget): Promise<FavoritableTarget | null>;
  /** Idempotent add — a duplicate heart is swallowed via the partial unique index (P2002). */
  add(tx: PrismaTx, favorite: NewFavorite): Promise<void>;
  /** Idempotent remove — removing a missing heart is a no-op. */
  remove(tx: PrismaTx, customerId: string, target: FavoriteTarget): Promise<void>;
}
```

- [ ] **Step 3: Sửa `prisma-favorite.repository.ts`**

a) Đổi khối import type từ port thành (giữ mọi import khác nguyên vẹn):

```ts
import type {
  FavoritableTarget,
  NewFavorite,
} from '../../domain/entities/favorite.entity';
import type { IFavoriteRepository } from '../../domain/ports/favorite-repository.port';
import type {
  CustomerFavoritePage,
  FavoriteCardRecord,
  FavoriteEntryRecord,
  FavoriteListPage,
  FavoriteSummaryRecord,
  IFavoriteReader,
} from '../../domain/ports/favorite-reader.port';
```

(Chỉ giữ những record type file thực sự dùng — nếu tên nào không được tham chiếu thì bỏ khỏi import
để lint không kêu.)

b) Đổi khai báo class:

```ts
export class PrismaFavoriteRepository implements IFavoriteRepository, IFavoriteReader {
```

c) Đổi `resolveTargetPartnerId` thành `findFavoritableTarget` (giữ nguyên 2 truy vấn + comment rule):

```ts
  async findFavoritableTarget(
    tx: PrismaTx,
    target: FavoriteTarget,
  ): Promise<FavoritableTarget | null> {
    // Only published targets can be favorited — matches what the storefront
    // surfaces, and blocks crafting a heart on a same-tenant draft/archived item.
    if (target.target === 'listing') {
      const listing = await tx.listing.findFirst({
        where: { id: target.targetId, status: 'published' },
        select: { partnerId: true },
      });
      return listing ? { target: 'listing', targetId: target.targetId, partnerId: listing.partnerId } : null;
    }
    const group = await tx.listingGroup.findFirst({
      where: { id: target.targetId, status: 'published' },
      select: { partnerId: true },
    });
    return group ? { target: 'group', targetId: target.targetId, partnerId: group.partnerId } : null;
  }
```

d) Đổi `add` sang nhận aggregate payload (giữ NGUYÊN try/catch P2002):

```ts
  async add(tx: PrismaTx, favorite: NewFavorite): Promise<void> {
    try {
      await tx.favorite.create({
        data: {
          tenantId: favorite.tenantId,
          customerId: favorite.customerId,
          partnerId: favorite.partnerId,
          listingId: favorite.listingId,
          groupId: favorite.groupId,
        },
      });
    } catch (error) {
      // A second heart on the same target is a no-op, not an error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }
```

e) Giữ nguyên `remove`. **Xoá hẳn method `isFavorited`** (dead code, 0 caller).

f) Giữ nguyên toàn bộ phần đọc (`listRefs`/`listCustomer`/`listDashboard`/`summary`, helper
`targetWhere`, `toVnd`, `priceFromModeConfig`, mọi projection).

- [ ] **Step 4: Viết lại `add-favorite.use-case.ts`** (toàn bộ file)

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { FavoriteTarget, FavoriteToggleResponse } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { Favorite } from '../../domain/entities/favorite.entity';
import { FavoriteTargetNotFound } from '../../domain/errors/favorite-errors';
import {
  FAVORITE_REPOSITORY,
  type IFavoriteRepository,
} from '../../domain/ports/favorite-repository.port';
import {
  FAVORITE_TENANT_READER,
  type IFavoriteTenantReader,
} from '../../domain/ports/favorite-tenant-reader.port';

@Injectable()
export class AddFavoriteUseCase {
  constructor(
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: IFavoriteRepository,
    @Inject(FAVORITE_TENANT_READER) private readonly tenants: IFavoriteTenantReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    customerId: string,
    target: FavoriteTarget,
  ): Promise<FavoriteToggleResponse> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId) throw new TenantNotFound();
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const favoritable = await this.favorites.findFavoritableTarget(tx, target);
      if (!favoritable) throw new FavoriteTargetNotFound();
      await this.favorites.add(tx, Favorite.open({ tenantId, customerId, target: favoritable }));
      return { ...target, favorited: true };
    });
  }
}
```

- [ ] **Step 5: `remove-favorite.use-case.ts`** — chỉ đổi phần lỗi tenant:

Thêm import `import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';`,
đổi `Inject, Injectable, NotFoundException` → `Inject, Injectable`, và thay khối

```ts
    if (!tenantId)
      throw new NotFoundException({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
```

bằng `if (!tenantId) throw new TenantNotFound();`. Phần còn lại giữ nguyên.

- [ ] **Step 6: 5 use-case đọc chuyển sang reader port**

Với `list-favorite-refs.use-case.ts` và `list-customer-favorites.use-case.ts`: đổi import port sang

```ts
import {
  FAVORITE_READER,
  type IFavoriteReader,
} from '../../domain/ports/favorite-reader.port';
```

đổi inject thành `@Inject(FAVORITE_READER) private readonly favorites: IFavoriteReader,` và áp cùng
cách thay `TENANT_NOT_FOUND` như Step 5 (thêm import `TenantNotFound`, bỏ `NotFoundException`).

Với `list-partner-favorites.use-case.ts`, `list-tenant-favorites.use-case.ts`,
`favorites-summary.use-case.ts`: chỉ đổi import + inject sang `FAVORITE_READER`/`IFavoriteReader`
(3 file này không resolve host, không có khối lỗi nào).

- [ ] **Step 7: `favorite.mapper.ts`** — đổi khối import type (dòng 8-14) từ
  `'../domain/ports/favorite-repository.port'` sang `'../domain/ports/favorite-reader.port'`
  (danh sách type giữ nguyên).

- [ ] **Step 8: `favorites.module.ts`** — bind bộ ba `useExisting`

Thêm `import { FAVORITE_READER } from '../../domain/ports/favorite-reader.port';` và thay dòng
`{ provide: FAVORITE_REPOSITORY, useClass: PrismaFavoriteRepository },` bằng:

```ts
    PrismaFavoriteRepository,
    { provide: FAVORITE_REPOSITORY, useExisting: PrismaFavoriteRepository },
    { provide: FAVORITE_READER, useExisting: PrismaFavoriteRepository },
```

- [ ] **Step 9: Typecheck + lint + build** — cả 3 exit 0.

- [ ] **Step 10: Đối chiếu wire (đọc, không chạy)** — `git diff HEAD -- apps/api/src/modules/favorites`

| Path | Cũ | Mới |
|---|---|---|
| Host không resolve tenant (4 use-case) | 404 `TENANT_NOT_FOUND` 'Tenant not found' | shared `TenantNotFound` → filter, y hệt |
| Target không tồn tại / chưa published | 404 `FAVORITE_TARGET_NOT_FOUND` 'Listing or group not found' | `FavoriteTargetNotFound` |
| Thả tim trùng | P2002 nuốt → 200 `{...target, favorited: true}` | y hệt (repo giữ nguyên try/catch) |
| Bỏ tim không tồn tại | `deleteMany` → 200 `{...target, favorited: false}` | y hệt |
| Cột XOR khi insert | ternary trong repo | `Favorite.open()` dựng — cùng giá trị |
| `createdAt` | DB default | không đổi (factory không stamp) |
| `isFavorited` | tồn tại, 0 caller | đã xoá |
| Read side | 4 method + 6 record type | chỉ DỜI sang reader port, logic y hệt |

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/favorites
git commit -m "refactor(favorites): write-path qua Favorite aggregate + tách reader port

XOR target dựng trong entity thay vì ternary ở repo; rule 'chỉ target published'
đặt tên thành findFavoritableTarget; 4 khối TENANT_NOT_FOUND dùng chung
TenantNotFound; xoá dead code isFavorited. Idempotency vẫn do partial unique
index + P2002 swallow + deleteMany. Wire byte-identical.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Docs

**Files:**
- Modify: `apps/api/CLAUDE.md` (danh sách module đã refactor)
- Modify: `docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md` (§8b-bis + §8c)

- [ ] **Step 1:** `apps/api/CLAUDE.md` — đổi
  `Refactored so far: **reviews, content-reports, notification**.` thành
  `Refactored so far: **reviews, content-reports, notification, favorites**.`

- [ ] **Step 2:** Trong spec, mục `### 8b-bis. Read-side follow-ups`, thêm bullet:

```markdown
- favorites: `toVnd` + `priceFromModeConfig` trong `prisma-favorite.repository.ts` là bản sao gần
  như y hệt của `catalog.mapper.ts` — nên hợp nhất về một nơi dùng chung (giữ `priceFrom` là chuỗi
  chữ số VND ở boundary), nhưng là read-side + xuyên module nên tách khỏi refactor này.
```

- [ ] **Step 3:** Trong spec, mục `### 8c. Dead-code list`, thêm bullet:

```markdown
- `favorites`: `isFavorited` (port + repo, 0 caller) — **đã xoá ở PR #4**
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/CLAUDE.md docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md
git commit -m "docs(api): favorites vào danh sách entity-style + sổ follow-up/dead-code

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Verify toàn bộ + runtime smoke + PR

- [ ] **Step 1: Full suite** — `nvm use` rồi `pnpm turbo lint typecheck build`; thêm
  `pnpm --filter=@booking/api check:rls`. Expected: xanh hết.

- [ ] **Step 2: Hạ tầng + API** — `docker ps` kiểm tra postgres/redis; `prisma:deploy`/`seed` nếu
  cần; boot riêng API (`PORT=3001` nếu 3000 bận), chờ "Nest application successfully started", kill
  khi xong.

- [ ] **Step 3: Headless smoke (curl + psql)** — endpoint trong
  `apps/api/src/modules/favorites/infrastructure/http/customer-favorite.controller.ts`; đăng nhập
  `customer@studiohub.vn` / `demo-password`, `Host: localhost`:

  1. Thả tim 1 listing **published** → 2xx `{ target:'listing', targetId:…, favorited:true }`;
     psql: `favorites` có row với `listing_id` set, `group_id` NULL, `partner_id` = partner của
     listing, `created_at` không null.
  2. Thả tim **lại** cùng listing → 2xx `favorited:true`, và psql: vẫn **đúng 1 row** (idempotent
     qua P2002).
  3. Bỏ tim → 2xx `favorited:false`; psql: 0 row.
  4. Bỏ tim **lại** → 2xx `favorited:false` (không lỗi).
  5. Thả tim 1 listing **KHÔNG published** (psql tìm listing `status <> 'published'` cùng tenant) →
     404 body đúng
     `{"statusCode":404,"code":"FAVORITE_TARGET_NOT_FOUND","message":"Listing or group not found"}`.
  6. Thả tim 1 **group** published → row có `group_id` set, `listing_id` NULL (chứng minh XOR cả 2
     nhánh).
  7. Gọi 1 endpoint đọc (danh sách yêu thích của customer + màn "ai đã thích" của partner với
     `giang@giangstudio.vn`) → 2xx, dữ liệu hiển thị đúng như trước (read side không đổi).
  8. Host không resolve tenant (ví dụ `Host: khong-ton-tai.local`) → 404 body đúng
     `{"statusCode":404,"code":"TENANT_NOT_FOUND","message":"Tenant not found"}`.

- [ ] **Step 4: Push + PR**

```bash
git push -u origin refactor/entity-favorites
gh pr create --base refactor/entity-centric --title "refactor(favorites): PR #4 — Favorite aggregate + tách reader port" --body "$(cat <<'EOF'
PR #4 của entity-centric refactor (spec docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md, style-gate 2026-07-23).

- Favorite aggregate: XOR target (`listingId` XOR `groupId`) dựng trong `Favorite.open()` thay vì ternary trong repository; `partnerId` là snapshot lúc tạo
- Rule "chỉ target tồn tại + published mới thả tim được" được đặt tên: `resolveTargetPartnerId` → `findFavoritableTarget`
- Tách reader port `FAVORITE_READER` (rule tách-khi-fat) + bind bộ ba `useExisting`; token write giữ nguyên
- 4 khối `TENANT_NOT_FOUND` copy-paste → shared `TenantNotFound`; `FAVORITE_TARGET_NOT_FOUND` thành domain error
- Xoá dead code `isFavorited` (port + repo, 0 caller)

Giữ nguyên tuyệt đối: idempotency do partial unique index + P2002 swallow + `deleteMany` (KHÔNG thay bằng check-then-create — TOCTOU); `createdAt` do DB cấp; host→tenant resolve ngoài tx trên admin pool; `findFavoritableTarget` vẫn chạy trong tenant tx dưới RLS; toàn bộ read side (kể cả `toVnd`/`priceFrom` trùng với catalog — đã ghi sổ follow-up §8b-bis).
Không đụng schema (XOR CHECK + partial unique index chỉ có trong SQL migration, vẫn là trọng tài).
Module không produce/consume outbox event nào — không đụng handler.

Verify: pnpm turbo lint typecheck build + check:rls xanh; smoke 8 case (thả/thả lại/bỏ/bỏ lại/target chưa published 404/group XOR/read side/host sai 404).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5:** Báo controller kết quả — KHÔNG tự merge, KHÔNG tự làm PR #5.
