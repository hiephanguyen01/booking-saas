# PR #9 — ListingType aggregate (catalog) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gom toàn bộ rule ghi của `ListingType` (slug, modes, booking-selection lock, search-config,
delete-in-use) vào một aggregate. Đây là module mà **invariant lõi đang nằm ở tầng application** —
`listing-type-search-config.validator.ts` là rule của aggregate nhưng lại ném `BadRequestException`
thẳng từ application layer. Wire byte-identical.

**Architecture:** Theo spec
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
§3 + style-gate đã ratify. Pattern như PR #2/#4/#5a: port làm I/O (slug lookup, đếm listing) rồi
**truyền dữ kiện đã resolve vào entity**; entity quyết định; repo ghi.

**Tech Stack:** NestJS 11, Prisma (RLS), zod contracts, pnpm 10.13.1, Node 22.22.0.

## Global Constraints

- **KHÔNG test** (ADR 0005); verify = `typecheck` + `lint` + `build` + chạy app.
- **ADR 0006**: không service class; 1 use-case = 1 file, 1 `execute()`.
- **Wire byte-identical** — 9 dòng dưới đây phải giữ **từng ký tự** (danh sách đóng băng):

  | code | status | message |
  |---|---|---|
  | `LISTING_TYPE_NOT_FOUND` | 404 | `Listing type not found` |
  | `LISTING_TYPE_SLUG_TAKEN` | 409 | `` Slug "${slug}" is already in use `` |
  | `INVALID_DEFAULT_MODES` | 400 | `` defaultModes must be a subset of allowedModes; invalid: ${invalid.join(', ')} `` |
  | `INVALID_FIXED_PACKAGE_MODES` | 400 | `Fixed packages only support hourly and daily booking modes` |
  | `BOOKING_SELECTION_LOCKED` | 409 | `Booking selection cannot change while listings use this type` |
  | `LISTING_TYPE_IN_USE` | 409 | `` Cannot delete a listing type with ${inUse} listing(s); deactivate it instead `` |
  | `INVALID_SEARCH_SCHEDULE` | 400 | `` Search schedule "${schedule}" must be enabled by allowedModes `` |
  | `INVALID_SEARCH_FACET` | 400 | 3 message động — xem Task 2 Step 1, copy nguyên văn |
  | `INVALID_SEARCH_BUCKETS` | 400 | `` Buckets "${a}" and "${b}" overlap in facet "${key}" `` |

### ⛔ Bề mặt đóng băng xuyên module (5 file trong `modules/listing` phụ thuộc)

- **`LISTING_TYPE_REPOSITORY` + `IListingTypeRepository.findById(tx, id) → ListingTypeRecord | null`**
  được `modules/listing` inject ở 5 chỗ (`create-listing`, `update-listing`, `create-listing-group`,
  `get-public-listing-group`, `get-listing-group-detail`). Chúng đọc các field
  `allowedModes`, `attributeSchema`, `bookingSelection`, `requiresIdentityVerification`, `structure`,
  `slug`, `itemLabel` **trực tiếp trên `ListingTypeRecord`**.
  ⇒ **KHÔNG đổi tên token, KHÔNG đổi chữ ký `findById`, KHÔNG đổi shape `ListingTypeRecord`,
  KHÔNG tách reader port.** Đây là lý do module này **giữ port hợp nhất** (spec §3 cho phép: tách
  chỉ khi port fat *và* làm được — ở đây consumer ngoài dùng chính token này để đọc).
- **`assertValidAttributes`** (`application/assert-valid-attributes.ts`) được `create-listing` và
  `update-listing` **plain-import**. Cùng `domain/attribute-schema.ts`: **KHÔNG đụng cả 2 file**,
  giữ nguyên envelope `INVALID_ATTRIBUTES` (có `details`). Không thêm method trùng lặp lên entity.
- Outbox: catalog **produce** `listing_type.created|updated|deleted` (payload `{ listingTypeId }`,
  0 consumer) — giữ nguyên eventType, payload, thứ tự emit (emit **sau** repo call, trong cùng tx).
  Catalog **không consume** event nào ⇒ không có `onModuleInit` ⇒ **normalization `tenantId ?? ''`
  của spec §4 không áp dụng cho PR này**.

### Known gap — GIỮ NGUYÊN, ghi sổ (spec §2.3 + §8a)

1. **Đường create không có re-check phía server** cho `defaultModes ⊆ allowedModes` và
   `fixed_packages` — hôm nay chỉ có zod refine ở contract. Entity **có** mirror 2 rule này nhưng
   **không với tới được** vì zod chạy trước (trả `VALIDATION_ERROR`) ⇒ chỉ là defensive depth,
   đúng pattern PR #1/#2. **Không được** đổi thứ tự để entity chặn trước zod.
2. **Message lệch nhau giữa contract refine và use-case** cho cùng rule fixed_packages:
   contract nói `fixed_packages only supports hourly and daily booking modes`, use-case nói
   `Fixed packages only support hourly and daily booking modes`. **Giữ cả hai y nguyên** — entity
   dùng bản của use-case (bản duy nhất với tới được, ở đường PATCH).
3. **P2002 của slug KHÔNG được dịch** (repo hiện không có try/catch nào) ⇒ race slug đồng thời vẫn
   leak lỗi Prisma thô thành 500. Đây là gap cùng loại đã ghi ở §8a cho partner/tenancy — **giữ
   nguyên**, thêm catalog vào register. Tiền-kiểm `findBySlug` vẫn giữ.
4. **Delete không dịch FK violation** — guard duy nhất là `countListingsOfType` (TOCTOU) +
   FK RESTRICT. Giữ nguyên, ghi sổ.
5. **`delete-listing-type` gọi `countListingsOfType` như một query THỨ HAI** dù `findById` vừa trả
   `listingCount`. Giữ nguyên 2 query (đổi = đổi hành vi tx).

### Đóng băng khác

- **Read-side đóng băng**: `list`, `listActive`, `findBySlug`, `findById`, `countListingsOfType`,
  `catalog.mapper.ts`, toàn bộ `search-public-catalog.use-case.ts`,
  `prisma-listing-read.repository.ts`, `redis-hold-reader.ts`, controllers, DTO — **không đụng**.
  (Các triệu chứng anemic ở read-side mà khảo sát nêu — buffer-window lặp 3 lần, `Date.now()`,
  priceFrom trùng với favorites — **ngoài phạm vi**, đã có sổ §8b-bis.)
- **Mọi validation chạy TRONG `forTenant` tx** như hiện tại; không thêm/bớt `forTenant` nào.
- **Dead code xoá trong PR này** (spec §4 + §8c): `ListPublicListingsUseCase`
  (`application/use-cases/list-public-listings.use-case.ts`) — là provider trong `catalog.module.ts`
  nhưng **0 controller inject** (grep xác nhận lại trước khi xoá).
- Domain framework-free: chỉ `import type` từ `@booking/contracts` + domain nội bộ (module này lấy
  `BookingMode`/`BookingSelection`/`AttributeField`/`ListingTypeSearchConfig`/`ListingStructure` từ
  `@booking/contracts` — **khác promotions**, đừng nhầm sang domain-local).
- Style-gate: private `_x` + accessor, defensive branch dùng `Error` thường, mã lỗi dùng chung ở
  `shared/domain/errors/`.
- Node **22.22.0** (`nvm use`), chỉ **pnpm**. Không đụng container/process project khác; smoke dùng
  `PORT=3001` nếu 3000 bận.
- Branch **`refactor/entity-catalog`** (từ `refactor/entity-centric`), PR vào `refactor/entity-centric`.
  ⚠️ **Commit plan này + mọi commit khác đều nằm trên nhánh feature** — nhánh tích hợp đang có PR #25
  (`refactor/entity-centric` → `main`) mở, không đổ thêm commit vào đó khi chưa được yêu cầu.

---

### Task 1: Branch + domain errors

**Files:**
- Create: `apps/api/src/modules/catalog/domain/errors/listing-type-errors.ts`

**Interfaces:** Produces — `ListingTypeNotFound`, `ListingTypeSlugTaken(slug)`,
`InvalidDefaultModes(invalid)`, `InvalidFixedPackageModes`, `BookingSelectionLocked`,
`ListingTypeInUse(count)`, `InvalidSearchSchedule(schedule)`, `InvalidSearchFacet(message)`,
`InvalidSearchBuckets(leftId, rightId, facetKey)`.

- [ ] **Step 1: Tạo branch**

```bash
cd "/Volumes/OVEN Duy/temp/booking-saas"
git checkout refactor/entity-centric && git pull origin refactor/entity-centric
git checkout -b refactor/entity-catalog
```

- [ ] **Step 2: Viết `domain/errors/listing-type-errors.ts`**

```ts
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the ListingType aggregate. Every code + status + message is
 * byte-identical to the pre-refactor use-case / search-config-validator behaviour
 * (wire frozen) — the dashboard branches on these codes.
 */

export class ListingTypeNotFound extends DomainError {
  constructor() {
    super('LISTING_TYPE_NOT_FOUND', 404, 'Listing type not found');
  }
}

export class ListingTypeSlugTaken extends DomainError {
  constructor(slug: string) {
    super('LISTING_TYPE_SLUG_TAKEN', 409, `Slug "${slug}" is already in use`);
  }
}

export class InvalidDefaultModes extends DomainError {
  constructor(invalid: string[]) {
    super(
      'INVALID_DEFAULT_MODES',
      400,
      `defaultModes must be a subset of allowedModes; invalid: ${invalid.join(', ')}`,
    );
  }
}

export class InvalidFixedPackageModes extends DomainError {
  constructor() {
    super(
      'INVALID_FIXED_PACKAGE_MODES',
      400,
      'Fixed packages only support hourly and daily booking modes',
    );
  }
}

/** The type's booking selection is frozen while listings already use it. */
export class BookingSelectionLocked extends DomainError {
  constructor() {
    super(
      'BOOKING_SELECTION_LOCKED',
      409,
      'Booking selection cannot change while listings use this type',
    );
  }
}

export class ListingTypeInUse extends DomainError {
  constructor(inUse: number) {
    super(
      'LISTING_TYPE_IN_USE',
      409,
      `Cannot delete a listing type with ${inUse} listing(s); deactivate it instead`,
    );
  }
}

export class InvalidSearchSchedule extends DomainError {
  constructor(schedule: string) {
    super(
      'INVALID_SEARCH_SCHEDULE',
      400,
      `Search schedule "${schedule}" must be enabled by allowedModes`,
    );
  }
}

/**
 * Three distinct facet rules share this code today; the caller passes the exact
 * message so the wire stays identical for each of them.
 */
export class InvalidSearchFacet extends DomainError {
  constructor(message: string) {
    super('INVALID_SEARCH_FACET', 400, message);
  }
}

export class InvalidSearchBuckets extends DomainError {
  constructor(leftId: string, rightId: string, facetKey: string) {
    super(
      'INVALID_SEARCH_BUCKETS',
      400,
      `Buckets "${leftId}" and "${rightId}" overlap in facet "${facetKey}"`,
    );
  }
}
```

- [ ] **Step 3: Typecheck** — `pnpm --filter=@booking/api typecheck`, exit 0.
- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/catalog/domain/errors
git commit -m "feat(catalog): domain errors cho ListingType aggregate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Search-config rule về domain + `ListingType` aggregate

**Files:**
- Create: `apps/api/src/modules/catalog/domain/listing-type-search-config.ts`
- Delete: `apps/api/src/modules/catalog/application/listing-type-search-config.validator.ts`
- Create: `apps/api/src/modules/catalog/domain/entities/listing-type.entity.ts`

**Interfaces:** Produces — `assertValidListingTypeSearchConfig(input)` (nay ở domain, ném domain
error); interfaces `ListingTypeState`, `NewListingType`, `ListingTypePatch`, `ListingTypeCreateFields`,
`ListingTypeUpdateFields`; class `ListingType` với `static rehydrate(state)`, `static open(input)`,
`applyUpdate(input, inUse)`, `assertDeletable(inUse)`, getters `id`/`slug`/`bookingSelection`.

- [ ] **Step 1: Chuyển validator sang domain**

Tạo `domain/listing-type-search-config.ts` = **bản sao nguyên văn** của
`application/listing-type-search-config.validator.ts`, chỉ đổi 2 thứ:
- bỏ `import { BadRequestException } from '@nestjs/common';`, bỏ hàm helper `invalid(code, message)`;
- 5 chỗ throw đổi sang domain error, **giữ nguyên từng ký tự message**:

| Rule | Throw cũ | Throw mới |
|---|---|---|
| schedule không nằm trong allowedModes | `invalid('INVALID_SEARCH_SCHEDULE', \`Search schedule "${searchConfig.schedule}" must be enabled by allowedModes\`)` | `new InvalidSearchSchedule(searchConfig.schedule)` |
| facet key không filterable | `invalid('INVALID_SEARCH_FACET', \`Search facet "${facet.key}" must reference a filterable attribute\`)` | `new InvalidSearchFacet(\`Search facet "${facet.key}" must reference a filterable attribute\`)` |
| control không hợp với type | `invalid('INVALID_SEARCH_FACET', \`Control "${facet.control}" is not supported for ${field.type} attribute "${facet.key}"\`)` | `new InvalidSearchFacet(\`Control "${facet.control}" is not supported for ${field.type} attribute "${facet.key}"\`)` |
| matchAll ngoài multiselect+checkbox | `invalid('INVALID_SEARCH_FACET', \`matchAll is only supported for multiselect checkbox facet "${facet.key}"\`)` | `new InvalidSearchFacet(\`matchAll is only supported for multiselect checkbox facet "${facet.key}"\`)` |
| bucket chồng nhau | `invalid('INVALID_SEARCH_BUCKETS', \`Buckets "${buckets[left].id}" and "${buckets[right].id}" overlap in facet "${facet.key}"\`)` | `new InvalidSearchBuckets(buckets[left].id, buckets[right].id, facet.key)` |

**Giữ nguyên tuyệt đối**: chữ ký `assertValidListingTypeSearchConfig({ allowedModes, attributeSchema,
searchConfig })`, bảng `CONTROL_BY_TYPE`, hàm `bucketsOverlap` (kể cả `±Infinity` và phép so
`leftMin < rightMax && rightMin < leftMax`), thứ tự 5 rule, cách duyệt cặp bucket.
Rồi **xoá** file validator cũ ở `application/` (chỉ 2 use-case của catalog import nó — Task 3 sửa).

- [ ] **Step 2: Viết `domain/entities/listing-type.entity.ts`**

```ts
import type {
  AttributeField,
  BookingMode,
  BookingSelection,
  ListingStructure,
  ListingTypeSearchConfig,
} from '@booking/contracts';
import {
  BookingSelectionLocked,
  InvalidDefaultModes,
  InvalidFixedPackageModes,
  ListingTypeInUse,
} from '../errors/listing-type-errors';
import { assertValidListingTypeSearchConfig } from '../listing-type-search-config';

/**
 * ListingType aggregate root (§7.3) — a tenant-defined category of listing. It owns
 * the schema every listing of that type is validated against, which booking modes it
 * permits, and how the storefront may search it.
 *
 * Owns the write rules that used to sit in the update use-case and (worse) in an
 * application-layer validator:
 *   - `defaultModes ⊆ allowedModes` and the `fixed_packages` mode restriction, both
 *     checked against MERGED state — a PATCH may send only one of the two fields, so
 *     the contract's zod refine cannot see the real outcome;
 *   - `bookingSelection` is frozen once listings exist ({@link BookingSelectionLocked});
 *   - searchConfig must stay consistent with the merged allowedModes + attributeSchema;
 *   - a type in use cannot be deleted.
 *
 * NOT owned here (deliberately):
 *   - slug uniqueness: needs a port lookup and is ultimately settled by the DB unique
 *     index — the use-case pre-checks, the index arbitrates (the pre-check is TOCTOU
 *     and that is preserved, see the plan's known-gap register);
 *   - `listingCount`: derived read data, so it is passed IN as a fact (`inUse`) rather
 *     than living in the aggregate's write-state;
 *   - attribute-value validation of individual listings (`assertValidAttributes`), which
 *     the listing module plain-imports — its path and error envelope are frozen.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** The persisted write-state (the columns this aggregate owns). */
export interface ListingTypeState {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  allowedModes: BookingMode[];
  defaultModes: BookingMode[];
  bookingSelection: BookingSelection;
  attributeSchema: AttributeField[];
  searchConfig: ListingTypeSearchConfig;
  unitLabel: string | null;
  sortOrder: number;
  isActive: boolean;
  requiresIdentityVerification: boolean;
  structure: ListingStructure;
  itemLabel: string | null;
}

/** Validated insert payload (id/tenantId/timestamps assigned by the DB + repo). */
export interface NewListingType {
  name: string;
  slug: string;
  icon: string | null;
  allowedModes: BookingMode[];
  defaultModes: BookingMode[];
  bookingSelection: BookingSelection;
  attributeSchema: AttributeField[];
  searchConfig: ListingTypeSearchConfig;
  unitLabel: string | null;
  sortOrder: number;
  isActive: boolean;
  requiresIdentityVerification: boolean;
  structure: ListingStructure;
  itemLabel: string | null;
}

/** The diff to persist — `undefined` on a key means "leave the stored value alone". */
export type ListingTypePatch = Partial<NewListingType>;

/** Contract-shaped create input (the fields the use-case receives). */
export interface ListingTypeCreateFields {
  name: string;
  slug: string;
  icon?: string | null;
  allowedModes: BookingMode[];
  defaultModes: BookingMode[];
  bookingSelection: BookingSelection;
  attributeSchema: AttributeField[];
  searchConfig: ListingTypeSearchConfig;
  unitLabel?: string | null;
  sortOrder: number;
  isActive: boolean;
  requiresIdentityVerification: boolean;
  structure: ListingStructure;
  itemLabel?: string | null;
}

/** Contract-shaped PATCH input — every key optional. */
export type ListingTypeUpdateFields = Partial<ListingTypeCreateFields>;

export class ListingType {
  private constructor(private readonly state: ListingTypeState) {}

  /** Rehydrate for the update / delete paths. */
  static rehydrate(state: ListingTypeState): ListingType {
    return new ListingType(state);
  }

  /**
   * Assemble a new listing type. The mode rules are re-stated here as defensive
   * depth: the contract's zod refine already rejects them at the HTTP boundary on
   * this path (it always fires on create), so these throws are unreachable in
   * practice — they exist so a non-HTTP caller cannot bypass the rule.
   */
  static open(input: ListingTypeCreateFields): NewListingType {
    assertModeRules(input.allowedModes, input.defaultModes, input.bookingSelection);
    assertValidListingTypeSearchConfig({
      allowedModes: input.allowedModes,
      attributeSchema: input.attributeSchema,
      searchConfig: input.searchConfig,
    });
    return {
      name: input.name,
      slug: input.slug,
      icon: input.icon ?? null,
      allowedModes: input.allowedModes,
      defaultModes: input.defaultModes,
      bookingSelection: input.bookingSelection,
      attributeSchema: input.attributeSchema,
      searchConfig: input.searchConfig,
      unitLabel: input.unitLabel ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      requiresIdentityVerification: input.requiresIdentityVerification,
      structure: input.structure,
      itemLabel: input.itemLabel ?? null,
    };
  }

  get id(): string {
    return this.state.id;
  }

  get slug(): string {
    return this.state.slug;
  }

  get bookingSelection(): BookingSelection {
    return this.state.bookingSelection;
  }

  /**
   * Merge a PATCH and enforce every rule against the RESULTING state.
   * `inUse` is the live listing count, resolved by the use-case — the booking-selection
   * lock is a rule about the type's relationship to its listings, not about its own
   * columns, so the fact is supplied rather than stored.
   */
  applyUpdate(input: ListingTypeUpdateFields, inUse: number): ListingTypePatch {
    const allowed = input.allowedModes ?? this.state.allowedModes;
    const defaults = input.defaultModes ?? this.state.defaultModes;
    const bookingSelection = input.bookingSelection ?? this.state.bookingSelection;
    assertModeRules(allowed, defaults, bookingSelection);
    if (
      input.bookingSelection !== undefined &&
      input.bookingSelection !== this.state.bookingSelection &&
      inUse > 0
    ) {
      throw new BookingSelectionLocked();
    }
    assertValidListingTypeSearchConfig({
      allowedModes: allowed,
      attributeSchema: input.attributeSchema ?? this.state.attributeSchema,
      searchConfig: input.searchConfig ?? this.state.searchConfig,
    });
    return {
      name: input.name,
      slug: input.slug,
      icon: input.icon,
      allowedModes: input.allowedModes,
      defaultModes: input.defaultModes,
      bookingSelection: input.bookingSelection,
      attributeSchema: input.attributeSchema,
      searchConfig: input.searchConfig,
      unitLabel: input.unitLabel,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      requiresIdentityVerification: input.requiresIdentityVerification,
      structure: input.structure,
      itemLabel: input.itemLabel,
    };
  }

  /** A type still referenced by listings must be deactivated, never deleted. */
  assertDeletable(inUse: number): void {
    if (inUse > 0) throw new ListingTypeInUse(inUse);
  }
}

/**
 * The two mode rules, shared by create and update so they cannot drift: every default
 * mode must be allowed, and fixed-package types only make sense hourly/daily.
 */
function assertModeRules(
  allowed: BookingMode[],
  defaults: BookingMode[],
  bookingSelection: BookingSelection,
): void {
  const invalid = defaults.filter((m) => !allowed.includes(m));
  if (invalid.length > 0) throw new InvalidDefaultModes(invalid);
  if (
    bookingSelection === 'fixed_packages' &&
    allowed.some((mode) => mode !== 'hourly' && mode !== 'daily')
  ) {
    throw new InvalidFixedPackageModes();
  }
}
```

- [ ] **Step 3: Typecheck** — sẽ ĐỎ ở 2 use-case (create/update) vì file validator cũ đã xoá. Xác nhận
  **chỉ** 2 lỗi đó (import không tìm thấy), không có lỗi khác; ghi output vào report. Task 3 sửa.
- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/catalog/domain apps/api/src/modules/catalog/application/listing-type-search-config.validator.ts
git commit -m "feat(catalog): ListingType aggregate + search-config rule về domain

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire 3 use-case ghi + port + repo + xoá dead code

**Files:**
- Modify: `apps/api/src/modules/catalog/domain/ports/listing-type-repository.port.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/prisma-listing-type.repository.ts`
- Rewrite: `apps/api/src/modules/catalog/application/use-cases/create-listing-type.use-case.ts`
- Rewrite: `apps/api/src/modules/catalog/application/use-cases/update-listing-type.use-case.ts`
- Modify: `apps/api/src/modules/catalog/application/use-cases/delete-listing-type.use-case.ts`
- Modify: `apps/api/src/modules/catalog/application/use-cases/get-listing-type.use-case.ts`
- Delete: `apps/api/src/modules/catalog/application/use-cases/list-public-listings.use-case.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/http/catalog.module.ts`

- [ ] **Step 1: Port** — trong `listing-type-repository.port.ts`:
  - thêm `import type { ListingTypePatch, NewListingType } from '../entities/listing-type.entity';`
  - xoá 2 interface `CreateListingTypeData` và `UpdateListingTypeData`
  - `create(tx, tenantId, data: NewListingType)` và `update(tx, id, patch: ListingTypePatch)`
  - **giữ nguyên hoàn toàn**: `ListingTypeRecord` (mọi field, kể cả `listingCount`/timestamps),
    `findById`, `findBySlug`, `list`, `listActive`, `delete`, `countListingsOfType`, token.
  - Grep `CreateListingTypeData|UpdateListingTypeData` toàn `apps/api/src` trước khi xoá; nếu có
    consumer ngoài catalog → **dừng, báo cáo**.

- [ ] **Step 2: Repo** — chỉ đổi kiểu tham số `create`/`update` sang `NewListingType`/
  `ListingTypePatch`. **Thân hàm giữ nguyên từng ký tự** (2 type có cùng tập field). Không đụng
  `LISTING_TYPE_INCLUDE`, `toRecord`, read method, `delete`, và **không thêm try/catch P2002/FK**
  (known gap #3, #4 — giữ nguyên).

- [ ] **Step 3: `create-listing-type.use-case.ts`** (viết lại) — giữ nguyên chữ ký
  `execute(tenantId, input: CreateListingTypeInput)`, thứ tự bước, và vị trí emit:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { CreateListingTypeInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingType } from '../../domain/entities/listing-type.entity';
import { ListingTypeSlugTaken } from '../../domain/errors/listing-type-errors';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
  type ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';

/** Tenant admin defines a new listing type with its typed attribute schema (§7.3). */
@Injectable()
export class CreateListingTypeUseCase {
  constructor(
    @Inject(LISTING_TYPE_REPOSITORY) private readonly repo: IListingTypeRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, input: CreateListingTypeInput): Promise<ListingTypeRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      // Pre-check only: the `(tenant_id, slug)` unique index is the real arbiter.
      if (await this.repo.findBySlug(tx, input.slug)) {
        throw new ListingTypeSlugTaken(input.slug);
      }
      const created = await this.repo.create(tx, tenantId, ListingType.open(input));
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_type.created',
        payload: { listingTypeId: created.id },
      });
      return created;
    });
  }
}
```

- [ ] **Step 4: `update-listing-type.use-case.ts`** (viết lại) — giữ nguyên chữ ký
  `execute(tenantId, id, input: UpdateListingTypeInput)` và **thứ tự lỗi 404 → 409 slug → các rule
  của entity**:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { UpdateListingTypeInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingType } from '../../domain/entities/listing-type.entity';
import {
  ListingTypeNotFound,
  ListingTypeSlugTaken,
} from '../../domain/errors/listing-type-errors';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
  type ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';

/** Tenant admin edits a listing type; the aggregate enforces the merged-state rules (§7.3). */
@Injectable()
export class UpdateListingTypeUseCase {
  constructor(
    @Inject(LISTING_TYPE_REPOSITORY) private readonly repo: IListingTypeRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    input: UpdateListingTypeInput,
  ): Promise<ListingTypeRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.repo.findById(tx, id);
      if (!existing) throw new ListingTypeNotFound();
      if (input.slug && input.slug !== existing.slug) {
        const other = await this.repo.findBySlug(tx, input.slug);
        if (other && other.id !== id) throw new ListingTypeSlugTaken(input.slug);
      }
      const listingType = ListingType.rehydrate(existing);
      const patch = listingType.applyUpdate(input, existing.listingCount);
      const updated = await this.repo.update(tx, id, patch);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_type.updated',
        payload: { listingTypeId: id },
      });
      return updated;
    });
  }
}
```
  Lưu ý: `ListingType.rehydrate(existing)` nhận thẳng `ListingTypeRecord` vì record là **superset**
  của `ListingTypeState` (structural typing) — không cần map thủ công. Nếu typecheck phàn nàn thì
  map tường minh 15 field, **không** nới lỏng kiểu.

- [ ] **Step 5: `delete-listing-type.use-case.ts`** — chỉ đổi 2 chỗ throw, **giữ nguyên 2 query**
  (`findById` rồi `countListingsOfType`, known gap #5):
  - `!existing` → `throw new ListingTypeNotFound();`
  - guard in-use → `ListingType.rehydrate(existing).assertDeletable(inUse);`
    (thay khối `if (inUse > 0) throw new ConflictException({...})`)
  - giữ nguyên `repo.delete` + emit `listing_type.deleted`.

- [ ] **Step 6: `get-listing-type.use-case.ts`** — đổi khối `throw new NotFoundException({...})`
  thành `throw new ListingTypeNotFound();` (đây là use-case đọc, nhưng mã lỗi dùng chung với
  write-path nên gom cùng để tránh 2 nguồn sự thật; không đổi gì khác).

- [ ] **Step 7: Xoá dead code** — `rm` file `list-public-listings.use-case.ts`; gỡ import + entry
  trong `providers` của `catalog.module.ts`. Grep `ListPublicListingsUseCase` toàn repo trước và sau
  (chỉ được còn 0 hit). **Đừng nhầm** với `ListPublicListingTypesUseCase` (đang được dùng thật).

- [ ] **Step 8: Typecheck + lint + build** — cả 3 exit 0.

- [ ] **Step 9: Đối chiếu (đọc, không chạy)** — `git diff HEAD -- apps/api/src/modules/catalog`:

  | Điểm | Kỳ vọng |
  |---|---|
  | 9 mã lỗi trong bảng Global Constraints | code/status/message y hệt, kể cả 3 message động của `INVALID_SEARCH_FACET` |
  | Thứ tự lỗi update | 404 → 409 slug → INVALID_DEFAULT_MODES → INVALID_FIXED_PACKAGE_MODES → BOOKING_SELECTION_LOCKED → search-config |
  | `ListingTypeRecord`, `findById`, token | không đổi một ký tự |
  | `assert-valid-attributes.ts`, `attribute-schema.ts` | không đụng |
  | emit 3 event | eventType + payload + vị trí (sau repo call, trong tx) không đổi |
  | repo `create`/`update` thân hàm | không đổi; vẫn không có try/catch P2002/FK |
  | read-side + search use-case + mapper | không đụng |
  | `ListPublicListingsUseCase` | đã xoá, 0 hit |

  ⚠️ **Thứ tự rule trong `applyUpdate` phải khớp bản cũ**: bản cũ chạy subset → fixed_packages →
  booking-selection-lock → search-config. Nếu bạn đảo (vd lock trước modes) thì một PATCH sai cả 2
  thứ sẽ trả mã lỗi khác trước đây ⇒ đổi wire. Kiểm kỹ.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/catalog
git commit -m "refactor(catalog): write-path qua ListingType aggregate + xoá dead code

Rule merged-state (defaultModes/fixed_packages/booking-selection lock), search-config
và delete-in-use dời vào entity; port create/update nhận NewListingType/ListingTypePatch.
findById + ListingTypeRecord + token giữ nguyên vì modules/listing inject trực tiếp.
Xoá ListPublicListingsUseCase (0 controller dùng).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Docs + verify + smoke + PR

- [ ] **Step 1: Docs**
  - `apps/api/CLAUDE.md`: thêm `catalog` vào danh sách `Refactored so far: …`.
  - Spec `### 8a`: thêm dòng
    `| P2002 leak thành 500 (listing-type slug) + FK violation khi delete không dịch | catalog | Giữ nguyên ở PR #9 — fix là behavior change của error envelope |`
  - Spec `### 8c`: đánh dấu `catalog: ListPublicListingsUseCase không có route` là
    `**[ĐÃ XOÁ ở PR #9]**`.
  - `docs/refactor/HANDOFF.md`: cập nhật bảng §1 (catalog ✅, module kế tiếp là **#10 tenancy**), và
    gợi ý cho tenancy: 4 aggregate (Tenant, TenantDomainPortfolio, SubscriptionPlan,
    TenantSubscription), gần như toàn bộ chạy trên **admin pool** — giữ nguyên dual-pool; rule
    "current subscription" đang nhân ba (TS + 2 bản raw-SQL) cần hợp nhất; `setPrimary` là atomic
    swap; worker DNS TXT **cố ý throw-để-retry**.

- [ ] **Step 2: Full suite** — `nvm use`; `pnpm turbo lint typecheck build` + `check:rls`, xanh hết.

- [ ] **Step 3: Hạ tầng + API** — `docker ps`; boot riêng API (`PORT=3001` nếu 3000 bận), chờ
  "Nest application successfully started"; kill khi xong.

- [ ] **Step 4: Headless smoke (curl + psql)** — đăng nhập tenant owner `owner@studiohub.vn` /
  `demo-password` (header `x-tenant-id`). Endpoint trong
  `apps/api/src/modules/catalog/infrastructure/http/tenant-listing-type.controller.ts`:

  1. **Tạo** listing type mới (slug chưa dùng) → 2xx; psql `listing_types` có row;
     `outbox_events` có `listing_type.created` payload `{"listingTypeId": "<id>"}`.
  2. **Tạo trùng slug** → 409 body chính xác
     `{"statusCode":409,"code":"LISTING_TYPE_SLUG_TAKEN","message":"Slug \"<slug>\" is already in use"}`.
  3. **PATCH chỉ `name`** → 2xx; psql: các cột khác (`allowed_modes`, `search_config`, `sort_order`)
     **không đổi** (chứng minh patch pass-through giữ nguyên ngữ nghĩa `undefined` = giữ).
  4. **PATCH `defaultModes` có mode không nằm trong `allowedModes`** → 400 body chính xác
     `{"statusCode":400,"code":"INVALID_DEFAULT_MODES","message":"defaultModes must be a subset of allowedModes; invalid: <mode>"}`
     (gửi **chỉ** `defaultModes`, không gửi `allowedModes` — để zod refine không bắt được, đúng
     đường merged-state của use-case).
  5. **PATCH `searchConfig.schedule`** sang mode không có trong `allowedModes` → 400
     `INVALID_SEARCH_SCHEDULE` với message nội suy đúng.
  6. **PATCH facet `buckets` chồng nhau** (vd `{min:0,max:10}` và `{min:5,max:20}`) → 400
     `INVALID_SEARCH_BUCKETS` message đúng dạng `Buckets "<a>" and "<b>" overlap in facet "<key>"`.
  7. **PATCH `bookingSelection`** trên một type **đang có listing** (psql tìm type có
     `listingCount > 0`) → 409 `BOOKING_SELECTION_LOCKED` message chính xác.
  8. **DELETE type đang có listing** → 409 body chính xác
     `{"statusCode":409,"code":"LISTING_TYPE_IN_USE","message":"Cannot delete a listing type with <n> listing(s); deactivate it instead"}`
     (số `<n>` phải khớp count thật).
  9. **DELETE type vừa tạo ở case 1** (chưa có listing) → 2xx; psql: row biến mất; `outbox_events`
     có `listing_type.deleted`.
  10. **GET type không tồn tại** → 404 `LISTING_TYPE_NOT_FOUND` 'Listing type not found'.
  11. **Regression xuyên module (quan trọng nhất)**: đăng nhập partner
      `giang@giangstudio.vn`, **tạo một listing** dùng một listing type có sẵn → thành công
      (chứng minh `findById` + `ListingTypeRecord` + `assertValidAttributes` còn nguyên); rồi tạo
      listing với `attributes` sai schema → **400 `INVALID_ATTRIBUTES`** với envelope còn
      nguyên field `details`.

  Nếu case nào không dựng được headless, **nói rõ**, đừng bịa.

- [ ] **Step 5: Push + PR**

```bash
git push -u origin refactor/entity-catalog
gh pr create --base refactor/entity-centric --title "refactor(catalog): PR #9 — ListingType aggregate" --body "$(cat <<'EOF'
PR #9 của entity-centric refactor (spec docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md).

- `ListingType` aggregate: gom rule merged-state (`defaultModes ⊆ allowedModes`, `fixed_packages` chỉ hourly/daily, booking-selection bị khoá khi đã có listing) + delete-in-use
- **Rule search-config rời khỏi tầng application**: `listing-type-search-config.validator.ts` (ném `BadRequestException` thẳng từ application) chuyển thành `domain/listing-type-search-config.ts` ném domain error — 5 rule, message giữ từng ký tự
- 9 mã lỗi thành domain error đi qua `DomainExceptionFilter` — envelope byte-identical
- Port `create`/`update` nhận `NewListingType`/`ListingTypePatch`
- Xoá dead code `ListPublicListingsUseCase` (provider nhưng 0 controller inject — spec §8c)

**Giữ nguyên có chủ đích** (bề mặt đóng băng xuyên module): token `LISTING_TYPE_REPOSITORY`, chữ ký `findById`, shape `ListingTypeRecord`, và `assertValidAttributes` + `attribute-schema.ts` — 5 file trong `modules/listing` phụ thuộc trực tiếp; **không tách reader port** vì consumer ngoài dùng chính token này để đọc.

**Known gap giữ nguyên + ghi sổ §8a**: P2002 của slug vẫn không được dịch (race đồng thời → 500), FK violation khi delete cũng vậy; đường create vẫn chỉ dựa vào zod refine cho 2 rule mode (entity có mirror nhưng không với tới được vì zod chạy trước); `delete` vẫn chạy 2 query đếm.

Outbox: catalog chỉ produce (`listing_type.created|updated|deleted`, 0 consumer) — eventType/payload/vị trí emit không đổi; module **không** consume event nào nên normalization `tenantId ?? ''` của spec §4 không áp dụng.

Verify: pnpm turbo lint typecheck build + check:rls xanh; smoke 11 case gồm 6 nhánh lỗi với body chính xác, PATCH-chỉ-name giữ nguyên cột khác, và regression xuyên module (tạo listing + `INVALID_ATTRIBUTES` còn nguyên `details`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6:** Báo controller kết quả — KHÔNG tự merge, KHÔNG tự bắt đầu PR #10.
