# PR #5a — Promotion aggregate (vòng đời chương trình) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa business core của vòng đời promotion (tạo/sửa/kết thúc/opt-in, cho cả tenant lẫn
partner) vào `Promotion` aggregate — trong đó khối tri-state merge 11 field đang bị **copy y hệt 2
bản** được gom về một chỗ. Wire byte-identical.

**Architecture:** Theo spec
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
(§3 + style-gate). Pattern như PR #1–#4: port làm ACL read (validate scope target, resolve funding
partner) rồi **truyền dữ kiện đã resolve vào entity**; entity quyết định và dựng state; repo ghi.

**Phạm vi:** module promotions bị tách làm 2 PR vì bề mặt quá rộng (20 use-case, 2 aggregate với
rủi ro rất khác nhau):
- **PR #5a (bản plan này)** — `Promotion`: 7 use-case ghi (`create-promotion`, `update-promotion`,
  `create-partner-promotion`, `update-partner-promotion`, `end-promotion`, `end-partner-promotion`,
  `opt-in-promotion`) + 4 helper rule + port/repo phần ghi cấu hình.
- **PR #5b (sau)** — `PromoRedemption` + `claimUsage`/`releaseUsage` + outbox handler + prepare/
  reserve/release/markApplied. **PR này KHÔNG đụng tới chúng.**

**Tech Stack:** NestJS 11, Prisma (RLS), zod contracts, pnpm 10.13.1, Node 22.22.0.

## Global Constraints

- **KHÔNG test** (ADR 0005); verify = `typecheck` + `lint` + `build` + chạy app.
- **ADR 0006**: không service class; 1 use-case = 1 file, 1 `execute()`.
- **Wire byte-identical** — 13 dòng dưới đây (12 mã; `PROMO_SCOPE_TARGET_INVALID` có 2 message) phải giữ **từng ký tự** (đây là danh sách đóng băng):

  | code | status | message |
  |---|---|---|
  | `PROMO_NOT_FOUND` | 404 | `Promotion not found` |
  | `PROMO_ENDED` | 409 | `An ended promotion cannot be edited` |
  | `PROMO_NOT_OWNED` | 403 | `Not your promotion` |
  | `PROMO_CODE_TAKEN` | 409 | `` Code "${code}" is already in use `` (nội suy code) |
  | `PROMO_NOT_FUNDED_BY_PARTNER` | 403 | `Not a promotion you fund` |
  | `PROMO_ALREADY_OPTED_IN` | 409 | `Already opted in` |
  | `PROMO_SCOPE_TARGET_INVALID` | 400 | `A scoped promotion requires a target id` |
  | `PROMO_SCOPE_TARGET_INVALID` | 400 | `` The target "${appliesToId}" is not a ${appliesTo} in this tenant `` |
  | `PROMO_SCOPE_REQUIRED` | 400 | `A target is required` |
  | `PROMO_SCOPE_NOT_OWNED` | 403 | `A partner can only promote its own listings` |
  | `PROMO_SCOPE_UNSUPPORTED` | 400 | `A partner promotion must target the partner itself, one of its listings, or a listing group` |
  | `PROMO_FUNDING_PARTNER_UNRESOLVED` | 400 | `A partner-funded promotion must target a partner, listing, or listing group` |
  | `PROMO_TENANT_SHARE_NEGATIVE` | 400 | **động** — `verdict.reason` từ `evaluateTenantShareRisk`, giữ nguyên nguồn |

- **⚠️ GIỮ NGUYÊN sự bất đối xứng của `end`** (known gap, spec §8a): `end-promotion` short-circuit khi
  đã ended (**không** ghi DB); `end-partner-promotion` **ghi vô điều kiện** (Prisma bump
  `updatedAt` ⇒ response khác nhau ở field đó). Đừng "sửa cho nhất quán" — đó là đổi hành vi API.
- **Tri-state ngữ nghĩa là hợp đồng**: `undefined` = giữ nguyên, `null` = xoá; riêng `timeWindows`
  mảng rỗng cũng = xoá. Gom 2 bản copy về entity nhưng **kết quả từng field phải y hệt**.
- **Code uniqueness giữ check-then-insert + DB unique** `@@unique([tenantId, code])`: entity không
  thay được constraint; giữ nguyên tiền-kiểm bằng `findByCode` trong tx (bỏ tiền-kiểm sẽ để lọt
  P2002 thô ra ngoài — cấm).
- **Mọi validation chạy TRONG `forTenant` tx** (scope target, funding partner đều là truy vấn
  RLS-scoped): không được đẩy ra pre-tx. Riêng `normalizeCode` là thuần, ở đâu cũng được — giữ đúng
  vị trí hiện tại của từng use-case.
- **Clock**: `partnerOptInAt` và auto-opt-in đang dùng app-clock `utcNow()` — use-case tiếp tục cấp
  `utcNow()` cho entity, KHÔNG đổi sang DB clock.
- **Money là `bigint` VND** trong entity/state; `vnd()` helper hiện dùng ở đâu giữ nguyên ở đó.
- **KHÔNG đụng** (thuộc PR #5b): `prepare-promotion`, `reserve-promotion`, `release-promotion`,
  `mark-promotion-applied`, `promo-redemption-repository.port.ts`, `prisma-promo-redemption.repository.ts`,
  `claimUsage`/`releaseUsage` trong repo, và **toàn bộ khối `onModuleInit`** (outbox handler) trong
  `promotions.module.ts`.
- **Surface freeze**: `PreparePromotionUseCase` + `ReservePromotionUseCase` được booking module import
  trực tiếp và gọi **trong tx của booking** — không đổi tên/chữ ký/vị trí file. `PromotionSnapshot`
  (`domain/promotion-application.ts`) được lưu trên booking row — không đụng.
- **Import xuyên module đang có sẵn** (`opt-in-promotion` + module wiring dùng
  `AGREEMENT_REPOSITORY`/`PrismaAgreementRepository` của module partner) — **giữ nguyên**, đây là vi
  phạm ADR có sẵn, sửa ở PR riêng (ghi §8c-bis).
  ⚠️ Rule lint mới (PR #19) cấm `application/**` import `**/infrastructure/**`: `opt-in-promotion`
  chỉ import *port* (`domain/ports/...`) nên không vi phạm; **file module wiring** (`infrastructure/http/...`)
  import class Prisma là hợp lệ vì nó nằm trong `infrastructure`. Nếu lint đỏ ở đây → dừng, báo cáo.
- Domain framework-free (chỉ `import type` từ `@booking/contracts` + domain nội bộ). Style-gate:
  private `_x` + accessor, defensive branch dùng `Error` thường, mã lỗi dùng chung ở `shared/domain/errors/`.
- Node **22.22.0** (`nvm use`), chỉ **pnpm**. Không đụng container/process project khác; smoke dùng
  `PORT=3001` nếu 3000 bận.
- Branch **`refactor/entity-promotion-lifecycle`** (từ `refactor/entity-centric`), PR vào
  `refactor/entity-centric`.

---

### Task 1: Branch + domain errors

**Files:**
- Create: `apps/api/src/modules/promotions/domain/errors/promotion-errors.ts`

**Interfaces:** Produces (Task 2–3 dùng): `PromotionNotFound`, `PromotionEnded`, `PromotionNotOwned`,
`PromotionCodeTaken(code)`, `PromotionNotFundedByPartner`, `PromotionAlreadyOptedIn`,
`PromoScopeTargetMissing`, `PromoScopeTargetInvalid(appliesTo, appliesToId)`, `PromoScopeRequired`,
`PromoScopeNotOwned`, `PromoScopeUnsupported`, `PromoFundingPartnerUnresolved`,
`PromoTenantShareNegative(reason)`.

- [ ] **Step 1: Tạo branch**

```bash
cd "/Volumes/OVEN Duy/temp/booking-saas"
git checkout refactor/entity-centric && git pull origin refactor/entity-centric
git checkout -b refactor/entity-promotion-lifecycle
```

- [ ] **Step 2: Viết `domain/errors/promotion-errors.ts`**

```ts
import { DomainError } from '../../../../shared/domain/domain-error';
import type { PromoAppliesTo } from '../promotion-discount';

/**
 * Domain errors for the Promotion aggregate. Every code + status + message is
 * byte-identical to the pre-refactor use-case/helper behaviour (wire frozen).
 */

export class PromotionNotFound extends DomainError {
  constructor() {
    super('PROMO_NOT_FOUND', 404, 'Promotion not found');
  }
}

export class PromotionEnded extends DomainError {
  constructor() {
    super('PROMO_ENDED', 409, 'An ended promotion cannot be edited');
  }
}

export class PromotionNotOwned extends DomainError {
  constructor() {
    super('PROMO_NOT_OWNED', 403, 'Not your promotion');
  }
}

export class PromotionCodeTaken extends DomainError {
  constructor(code: string) {
    super('PROMO_CODE_TAKEN', 409, `Code "${code}" is already in use`);
  }
}

export class PromotionNotFundedByPartner extends DomainError {
  constructor() {
    super('PROMO_NOT_FUNDED_BY_PARTNER', 403, 'Not a promotion you fund');
  }
}

export class PromotionAlreadyOptedIn extends DomainError {
  constructor() {
    super('PROMO_ALREADY_OPTED_IN', 409, 'Already opted in');
  }
}

/** A non-`all` scope was declared without a target id. */
export class PromoScopeTargetMissing extends DomainError {
  constructor() {
    super('PROMO_SCOPE_TARGET_INVALID', 400, 'A scoped promotion requires a target id');
  }
}

/** The target id does not resolve to an entity of the declared type in this tenant. */
export class PromoScopeTargetInvalid extends DomainError {
  constructor(appliesTo: PromoAppliesTo, appliesToId: string) {
    super(
      'PROMO_SCOPE_TARGET_INVALID',
      400,
      `The target "${appliesToId}" is not a ${appliesTo} in this tenant`,
    );
  }
}

export class PromoScopeRequired extends DomainError {
  constructor() {
    super('PROMO_SCOPE_REQUIRED', 400, 'A target is required');
  }
}

export class PromoScopeNotOwned extends DomainError {
  constructor() {
    super('PROMO_SCOPE_NOT_OWNED', 403, 'A partner can only promote its own listings');
  }
}

export class PromoScopeUnsupported extends DomainError {
  constructor() {
    super(
      'PROMO_SCOPE_UNSUPPORTED',
      400,
      'A partner promotion must target the partner itself, one of its listings, or a listing group',
    );
  }
}

export class PromoFundingPartnerUnresolved extends DomainError {
  constructor() {
    super(
      'PROMO_FUNDING_PARTNER_UNRESOLVED',
      400,
      'A partner-funded promotion must target a partner, listing, or listing group',
    );
  }
}

/** §12.4 — a tenant-funded discount that would drive the tenant commission share negative. */
export class PromoTenantShareNegative extends DomainError {
  constructor(reason: string) {
    super('PROMO_TENANT_SHARE_NEGATIVE', 400, reason);
  }
}
```

- [ ] **Step 3: Typecheck** — `pnpm --filter=@booking/api typecheck`, exit 0.
- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/promotions/domain/errors
git commit -m "feat(promotions): domain errors cho Promotion aggregate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `Promotion` aggregate

**Files:**
- Create: `apps/api/src/modules/promotions/domain/entities/promotion.entity.ts`

**Interfaces:** Produces — interfaces `PromotionState`, `NewPromotion`, `PromotionPatch`,
`PromotionUpdateInput`, `ResolvedScope`; class `Promotion` với `static rehydrate(state)`,
`static open(input)`, `static openForPartner(input)`, getters `id`/`status`/`fundedBy`/
`fundingPartnerId`/`partnerOptInAt`/`createdByPartnerId`/`code`/`appliesTo`/`appliesToId`/
`discountType`/`discountValue`/`isEnded`, method `assertEditable()`, `assertCreatedBy(partnerId)`,
`assertCanOptIn(partnerId)`, `applyUpdate(input, resolved?)`.

**Ghi chú thiết kế:** entity KHÔNG tự tra cứu gì — mọi dữ kiện cần I/O (scope target hợp lệ, funding
partner id, kết quả kiểm tra tenant-share, code đã bị chiếm chưa) do use-case resolve qua port rồi
truyền vào. Đây đúng pattern của PR #2/#4.

- [ ] **Step 1: Viết `domain/entities/promotion.entity.ts`**

```ts
import type {
  PromoAppliesTo,
  PromoDiscountType,
  PromoFundedBy,
  PromoStatus,
  PromoTimeWindow,
} from '../promotion-discount';
import {
  PromotionAlreadyOptedIn,
  PromotionEnded,
  PromotionNotFundedByPartner,
  PromotionNotOwned,
} from '../errors/promotion-errors';

/**
 * Promotion aggregate root (§12) — one promotion program: identity (code or auto
 * campaign), discount config, scope, funding + partner opt-in gate, limits, schedule
 * and lifecycle draft→active→paused→ended.
 *
 * Owns the write rules that used to be scattered across seven use-cases:
 *   - creation assembly, including the tenant-created vs partner-created defaults
 *     ({@link Promotion.open} / {@link Promotion.openForPartner});
 *   - the tri-state update merge (`undefined` = keep, `null` = clear, empty
 *     `timeWindows` array = clear) that was copy-pasted byte-for-byte into both the
 *     tenant and the partner update use-case — {@link Promotion.applyUpdate};
 *   - the edit/ownership/opt-in guards;
 *   - the rule that changing the funding partner re-arms the opt-in gate.
 *
 * NOT owned here (deliberately): anything needing I/O. Scope-target validity, the
 * funding partner behind a scope, the tenant-share risk verdict and code uniqueness
 * are resolved by the use-case through ports (RLS-scoped, inside the tx) and handed
 * in as facts. Usage claim/release and redemptions belong to PR #5b and are untouched.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** The persisted write-state the lifecycle paths need. */
export interface PromotionState {
  id: string;
  code: string | null;
  status: PromoStatus;
  discountType: PromoDiscountType;
  discountValue: bigint;
  fundedBy: PromoFundedBy;
  appliesTo: PromoAppliesTo;
  appliesToId: string | null;
  fundingPartnerId: string | null;
  partnerOptInAt: Date | null;
  createdByPartnerId: string | null;
}

/** Validated insert payload (id/redeemedCount/createdAt assigned by the DB). */
export interface NewPromotion {
  name: string;
  code: string | null;
  discountType: PromoDiscountType;
  discountValue: bigint;
  maxDiscount: bigint | null;
  fundedBy: PromoFundedBy;
  appliesTo: PromoAppliesTo;
  appliesToId: string | null;
  minOrderAmount: bigint | null;
  firstBookingOnly: boolean;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number | null;
  timeWindows: PromoTimeWindow[] | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: 'draft' | 'active' | 'paused';
  createdByPartnerId: string | null;
  fundingPartnerId: string | null;
  partnerOptInAt: Date | null;
}

/** The diff to persist — only the keys actually being changed (tri-state preserved). */
export type PromotionPatch = Partial<NewPromotion>;

/** A scope the use-case already validated (target exists, is of the declared type). */
export interface ResolvedScope {
  appliesTo: PromoAppliesTo;
  /** Already normalized: `null` when `appliesTo === 'all'`. */
  appliesToId: string | null;
  /** Resolved owner for a partner-funded scope; `null` for tenant-funded. */
  fundingPartnerId: string | null;
}

/** The funding fields a re-point writes — `partnerOptInAt` present only when the gate re-arms. */
export type FundingChange = Pick<
  PromotionPatch,
  'fundedBy' | 'fundingPartnerId' | 'partnerOptInAt'
>;

/** The raw (contract-shaped) update payload — every field optional, `null` means clear. */
export interface PromotionUpdateInput {
  name?: string;
  discountType?: PromoDiscountType;
  discountValue?: bigint;
  maxDiscount?: bigint | null;
  minOrderAmount?: bigint | null;
  firstBookingOnly?: boolean;
  usageLimitTotal?: number | null;
  usageLimitPerCustomer?: number | null;
  timeWindows?: PromoTimeWindow[] | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  status?: 'draft' | 'active' | 'paused';
}

export class Promotion {
  private constructor(private readonly state: PromotionState) {}

  /** Rehydrate for the update / end / opt-in paths. */
  static rehydrate(state: PromotionState): Promotion {
    return new Promotion(state);
  }

  /**
   * Assemble a tenant-created promotion. A tenant promotion is never owned by a
   * partner, and its opt-in gate is only armed when it is partner-funded (the
   * use-case passes the resolved funding partner in `scope`).
   */
  static open(input: {
    fields: Omit<
      NewPromotion,
      'appliesTo' | 'appliesToId' | 'createdByPartnerId' | 'fundingPartnerId' | 'partnerOptInAt'
    >;
    scope: ResolvedScope;
  }): NewPromotion {
    return {
      ...input.fields,
      appliesTo: input.scope.appliesTo,
      appliesToId: input.scope.appliesToId,
      createdByPartnerId: null,
      fundingPartnerId: input.scope.fundingPartnerId,
      partnerOptInAt: null,
    };
  }

  /**
   * Assemble a partner-created promotion: always partner-funded, funded by and owned
   * by that partner, and auto-opted-in (the partner creating it IS the consent).
   */
  static openForPartner(input: {
    fields: Omit<
      NewPromotion,
      'appliesTo' | 'appliesToId' | 'createdByPartnerId' | 'fundingPartnerId' | 'partnerOptInAt' | 'fundedBy'
    >;
    partnerId: string;
    appliesTo: PromoAppliesTo;
    appliesToId: string | null;
    now: Date;
  }): NewPromotion {
    return {
      ...input.fields,
      fundedBy: 'partner',
      appliesTo: input.appliesTo,
      appliesToId: input.appliesToId,
      createdByPartnerId: input.partnerId,
      fundingPartnerId: input.partnerId,
      partnerOptInAt: input.now,
    };
  }

  get id(): string {
    return this.state.id;
  }

  get code(): string | null {
    return this.state.code;
  }

  get status(): PromoStatus {
    return this.state.status;
  }

  get isEnded(): boolean {
    return this.state.status === 'ended';
  }

  get fundedBy(): PromoFundedBy {
    return this.state.fundedBy;
  }

  get fundingPartnerId(): string | null {
    return this.state.fundingPartnerId;
  }

  get partnerOptInAt(): Date | null {
    return this.state.partnerOptInAt;
  }

  get createdByPartnerId(): string | null {
    return this.state.createdByPartnerId;
  }

  get appliesTo(): PromoAppliesTo {
    return this.state.appliesTo;
  }

  get appliesToId(): string | null {
    return this.state.appliesToId;
  }

  get discountType(): PromoDiscountType {
    return this.state.discountType;
  }

  get discountValue(): bigint {
    return this.state.discountValue;
  }

  /** An ended promotion is frozen — it can never be edited again. */
  assertEditable(): void {
    if (this.isEnded) throw new PromotionEnded();
  }

  /** Only the partner that created a promotion may manage it. */
  assertCreatedBy(partnerId: string): void {
    if (this.state.createdByPartnerId !== partnerId) throw new PromotionNotOwned();
  }

  /** Opt-in is only for the funding partner of a partner-funded promo, and only once. */
  assertCanOptIn(partnerId: string): void {
    if (this.state.fundedBy !== 'partner' || this.state.fundingPartnerId !== partnerId) {
      throw new PromotionNotFundedByPartner();
    }
    if (this.state.partnerOptInAt !== null) throw new PromotionAlreadyOptedIn();
  }

  /**
   * The tri-state merge: a key is written only when the caller actually supplied it
   * (`undefined` = keep the stored value), `null` clears an optional condition, and an
   * empty `timeWindows` array clears too ("no windows" and "always applicable" are the
   * same state).
   *
   * Scope/funding fields are NOT handled here — the caller writes them, because which
   * of `appliesTo`/`appliesToId` gets written depends on which keys the client sent.
   * The funding-consent rule lives in {@link Promotion.resolveFundingChange}.
   */
  applyUpdate(input: PromotionUpdateInput): PromotionPatch {
    const patch: PromotionPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.discountType !== undefined) patch.discountType = input.discountType;
    if (input.discountValue !== undefined) patch.discountValue = input.discountValue;
    if (input.maxDiscount !== undefined) patch.maxDiscount = input.maxDiscount;
    if (input.minOrderAmount !== undefined) patch.minOrderAmount = input.minOrderAmount;
    if (input.firstBookingOnly !== undefined) patch.firstBookingOnly = input.firstBookingOnly;
    if (input.usageLimitTotal !== undefined) patch.usageLimitTotal = input.usageLimitTotal;
    if (input.usageLimitPerCustomer !== undefined) {
      patch.usageLimitPerCustomer = input.usageLimitPerCustomer;
    }
    if (input.timeWindows !== undefined) {
      patch.timeWindows =
        input.timeWindows === null || input.timeWindows.length === 0 ? null : input.timeWindows;
    }
    if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
    if (input.endsAt !== undefined) patch.endsAt = input.endsAt;
    if (input.status !== undefined) patch.status = input.status;
    return patch;
  }

  /**
   * §12.2 — the funding-consent rule for a re-pointed promotion. `partnerOptInAt` IS
   * the funding partner's consent, so it must never survive a change of who pays:
   *   - a partner-funded promo keeps its gate only while the funding partner is
   *     unchanged; a different partner has to opt in again before it applies to them;
   *   - moving back to tenant funding drops the gate entirely.
   * Returns only the funding fields to merge into the patch (the caller owns the
   * scope fields — see {@link Promotion.applyUpdate}).
   */
  resolveFundingChange(next: {
    fundedBy: PromoFundedBy;
    fundingPartnerId: string | null;
  }): FundingChange {
    if (next.fundedBy !== 'partner') {
      return { fundedBy: 'tenant', fundingPartnerId: null, partnerOptInAt: null };
    }
    const gateSurvives = next.fundingPartnerId === this.state.fundingPartnerId;
    return {
      fundedBy: 'partner',
      fundingPartnerId: next.fundingPartnerId,
      ...(gateSurvives ? {} : { partnerOptInAt: null }),
    };
  }
}
```

- [ ] **Step 2: Typecheck** — exit 0.
- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/promotions/domain/entities
git commit -m "feat(promotions): Promotion aggregate — assembly + tri-state merge + guards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Đổi 4 helper sang domain error

**Files:**
- Modify: `apps/api/src/modules/promotions/application/assert-scope-target.ts`
- Modify: `apps/api/src/modules/promotions/application/assert-partner-owns-scope.ts`
- Modify: `apps/api/src/modules/promotions/application/assert-tenant-share-risk.ts`
- Modify: `apps/api/src/modules/promotions/application/resolve-funding-partner.ts`

Giữ nguyên **signature, vị trí file, thứ tự bước và mọi truy vấn port** của cả 4 hàm — chỉ thay chỗ
`throw new XxxException({...})` bằng domain error tương ứng và bỏ import Nest exception không còn dùng:

| File | Throw cũ | Throw mới |
|---|---|---|
| `assert-scope-target.ts` | `BadRequestException` 'A scoped promotion requires a target id' | `new PromoScopeTargetMissing()` |
| `assert-scope-target.ts` | `BadRequestException` `The target "…" is not a … in this tenant` | `new PromoScopeTargetInvalid(appliesTo, appliesToId)` |
| `assert-partner-owns-scope.ts` | `BadRequestException` 'A target is required' | `new PromoScopeRequired()` |
| `assert-partner-owns-scope.ts` | `ForbiddenException` 'A partner can only promote its own listings' | `new PromoScopeNotOwned()` |
| `assert-partner-owns-scope.ts` | `BadRequestException` 'A partner promotion must target…' | `new PromoScopeUnsupported()` |
| `assert-tenant-share-risk.ts` | `BadRequestException` `verdict.reason` | `new PromoTenantShareNegative(verdict.reason)` |
| `resolve-funding-partner.ts` | `BadRequestException` 'A partner-funded promotion must target…' | `new PromoFundingPartnerUnresolved()` |

**Không đổi**: nhánh `warn` chỉ log (không throw) trong `assert-tenant-share-risk.ts`; nhánh no-op
khi `fundedBy !== 'tenant'`; toàn bộ logic tra cứu.

- [ ] **Step 1:** Áp 7 thay thế ở trên (đọc từng file, chỉ sửa chỗ throw + import).
- [ ] **Step 2: Typecheck + lint** — exit 0 (lint sẽ bắt import Nest thừa).
- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/promotions/application
git commit -m "refactor(promotions): 4 helper rule ném domain error thay HttpException

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 7 use-case ghi + port + repo

**Files:**
- Modify: `apps/api/src/modules/promotions/domain/ports/promotion-repository.port.ts`
- Modify: `apps/api/src/modules/promotions/infrastructure/repositories/prisma-promotion.repository.ts`
- Rewrite: 7 file use-case ghi trong `apps/api/src/modules/promotions/application/use-cases/`

**Interfaces:** port đổi `create(tx, tenantId, data: NewPromotion)` và
`update(tx, id, patch: PromotionPatch)` (2 type nhập từ entity; `CreatePromotionData`/
`UpdatePromotionData` bị xoá — grep xác nhận không có consumer ngoài module). `end`,
`setPartnerOptIn`, `claimUsage`, `releaseUsage` và toàn bộ method đọc **giữ nguyên chữ ký**.

- [ ] **Step 1: Port** — trong `promotion-repository.port.ts`:
  - thêm `import type { NewPromotion, PromotionPatch } from '../entities/promotion.entity';`
  - xoá 2 interface `CreatePromotionData` / `UpdatePromotionData`
  - đổi `create(...): Promise<PromotionRecord>` → nhận `data: NewPromotion`
  - đổi `update(...): Promise<PromotionRecord>` → nhận `patch: PromotionPatch`
  - giữ nguyên `PromotionRecord` và mọi method còn lại.

- [ ] **Step 2: Repo** — trong `prisma-promotion.repository.ts`: đổi import + kiểu tham số của
  `create`/`update` sang `NewPromotion`/`PromotionPatch`. **Thân hàm giữ nguyên** (2 type có cùng
  tập field như trước, `PromotionPatch = Partial<NewPromotion>`). Không đụng `end`,
  `setPartnerOptIn`, `claimUsage`, `releaseUsage`, và mọi projection đọc.

- [ ] **Step 3: `create-promotion.use-case.ts`** — giữ nguyên toàn bộ thứ tự bước (normalizeCode
  ngoài tx; trong tx: code-clash → tenant-share → scope → funding), chỉ thay:
  - `throw new ConflictException({...PROMO_CODE_TAKEN})` → `throw new PromotionCodeTaken(code)`
  - phần assemble `CreatePromotionData` (khối literal ~L59-79) → gọi

    ```ts
    const data = Promotion.open({
      fields: { /* đúng các field cũ, TRỪ appliesTo/appliesToId/createdByPartnerId/fundingPartnerId/partnerOptInAt */ },
      scope: { appliesTo: input.appliesTo, appliesToId, fundingPartnerId },
    });
    ```
    trong đó `appliesToId` và `fundingPartnerId` là đúng 2 biến đã resolve ở bước trên (giữ nguyên
    cách tính, kể cả normalize `'all'` → `null`).
  - `this.promotions.create(tx, tenantId, data)` giữ nguyên.

- [ ] **Step 4: `create-partner-promotion.use-case.ts`** — tương tự, phần assemble → gọi

  ```ts
  const data = Promotion.openForPartner({
    fields: { /* các field cũ, TRỪ 6 field entity tự set */ },
    partnerId,
    appliesTo: input.appliesTo,
    appliesToId,
    now: utcNow(),
  });
  ```
  (Giữ đúng nguồn clock `utcNow()` như cũ.) Thay throw code-taken như Step 3.

- [ ] **Step 5: `update-promotion.use-case.ts`** — thay:
  - `findById` null → `throw new PromotionNotFound()`
  - check ended → `promotion.assertEditable()` sau khi `const promotion = Promotion.rehydrate(...)`
    (rehydrate từ `existing`; các field của `PromotionState` lấy thẳng từ `PromotionRecord`)
  - khối tri-state 11 field (L58-76) → `const data = promotion.applyUpdate(updateInput)` với
    `updateInput` là các giá trị đã chuyển kiểu **y hệt cách cũ** (`vnd(...)` cho tiền,
    `new Date(...)` cho ngày, `null` giữ nguyên là `null`)
  - khối scope/funding (L78-99): **giữ nguyên y hệt** cách tính `scopeTouched`, `appliesTo`,
    `appliesToId` và 2 lệnh ghi có điều kiện `data.appliesTo` / `data.appliesToId` (chúng phụ thuộc
    client gửi key nào — entity không quyết định được); giữ nguyên lời gọi `assertScopeTargetValid`
    và `resolveFundingPartnerId`. **Chỉ thay 8 dòng gán funding** (nhánh if/else `fundedBy`) bằng:

    ```ts
        const fundingPartnerId =
          fundedBy === 'partner' ? await resolveFundingPartnerId(tx, appliesTo, appliesToId) : null;
        Object.assign(data, promotion.resolveFundingChange({ fundedBy, fundingPartnerId }));
    ```
    Kết quả phải khớp từng nhánh với bản cũ: partner + funding đổi → ghi `partnerOptInAt: null`;
    partner + funding **không** đổi → **không** ghi `partnerOptInAt`; tenant → ghi cả 3 field.
  - khối code (L101-114): giữ nguyên, chỉ đổi throw sang `PromotionCodeTaken(code)`.

- [ ] **Step 6: `update-partner-promotion.use-case.ts`** — thay:
  - `findById` null → `PromotionNotFound`; ownership → `promotion.assertCreatedBy(partnerId)`;
    ended → `promotion.assertEditable()` (giữ đúng **thứ tự** 404 → 403 → 409 như cũ)
  - khối tri-state (L41-57) → `promotion.applyUpdate(updateInput)` — **đây là bản copy thứ 2 bị xoá**
  - khối scope (L59-70): **giữ nguyên hoàn toàn** (`assertPartnerOwnsScope`, ghi `appliesTo`,
    `appliesToId`, `fundingPartnerId: partnerId`). Path partner **không** gọi `resolveFundingChange`
    và **không bao giờ** đụng `fundedBy`/`partnerOptInAt` — đúng như bản cũ.
  - code → `PromotionCodeTaken(code)`.

- [ ] **Step 7: `end-promotion.use-case.ts`** — `findById` null → `PromotionNotFound`; giữ nguyên
  short-circuit `if (promotion.isEnded) return existing;` rồi `this.promotions.end(tx, id)`.

- [ ] **Step 8: `end-partner-promotion.use-case.ts`** — `findById` null → `PromotionNotFound`;
  ownership → `promotion.assertCreatedBy(partnerId)`; rồi **gọi `end` VÔ ĐIỀU KIỆN như cũ**.
  Thêm comment ngay trên dòng đó:

  ```ts
      // KNOWN GAP (spec §8a): the tenant path short-circuits when already ended; this one
      // writes unconditionally (bumping updatedAt). Preserved on purpose — aligning them
      // would change the API response.
  ```

- [ ] **Step 9: `opt-in-promotion.use-case.ts`** — `findById` null → `PromotionNotFound`; 2 guard
  (funded-by-partner, already-opted-in) → `promotion.assertCanOptIn(partnerId)` (thứ tự lỗi 403
  trước 409 được bảo toàn bên trong entity); giữ nguyên `setPartnerOptIn(tx, id, utcNow())` và
  **nguyên vẹn** lời gọi `this.agreements.record(...)` cùng tx.

- [ ] **Step 10: Typecheck + lint + build** — cả 3 exit 0.

- [ ] **Step 11: Đối chiếu (đọc, không chạy)** — `git diff HEAD -- apps/api/src/modules/promotions`.
  Kiểm đủ:
  - 13 dòng lỗi trong bảng ở Global Constraints: code/status/message y hệt.
  - Thứ tự guard mỗi use-case không đổi (đặc biệt update-partner: 404 → 403 → 409).
  - Tri-state: mọi field trong 2 khối cũ đều có mặt trong `applyUpdate`, cùng cách xử lý `null` và
    mảng rỗng.
  - `end` bất đối xứng còn nguyên.
  - Không file nào thuộc PR #5b bị đụng (`prepare/reserve/release/mark-*`, redemption port/repo,
    `claimUsage`/`releaseUsage`, `onModuleInit`).

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/modules/promotions
git commit -m "refactor(promotions): 7 use-case ghi qua Promotion aggregate

Gom khối tri-state merge 11 field (trước bị copy y hệt ở 2 use-case) vào
applyUpdate; guard ended/ownership/opt-in về entity; port create/update nhận
NewPromotion/PromotionPatch. Bất đối xứng end (known gap §8a) giữ nguyên.
Redemption + usage claim thuộc PR #5b, không đụng.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Docs + verify + smoke + PR

- [ ] **Step 1: Docs** — `apps/api/CLAUDE.md`: đổi `Refactored so far: **reviews, content-reports,
  notification, favorites**.` thành `… , favorites, promotions (vòng đời — PR #5a)**.`
  Trong spec `### 8c-bis`, thêm mục 5:

  ```markdown
  5. **promotions import chéo module partner** (`AGREEMENT_REPOSITORY` + `PrismaAgreementRepository`
     trong `opt-in-promotion` và module wiring) — vi phạm ADR 0003 có sẵn từ trước, PR #5a giữ
     nguyên. Sửa bằng cách đưa việc ghi agreement qua outbox hoặc một port riêng, ở PR độc lập.
  ```

- [ ] **Step 2: Full suite** — `nvm use`; `pnpm turbo lint typecheck build` + `check:rls`, xanh hết.

- [ ] **Step 3: Hạ tầng + API** — `docker ps`; boot riêng API (`PORT=3001` nếu bận), chờ
  "Nest application successfully started", kill khi xong.

- [ ] **Step 4: Headless smoke (curl + psql)** — đăng nhập tenant owner `owner@studiohub.vn` /
  `demo-password` (header `x-tenant-id`), partner `giang@giangstudio.vn` (header `x-partner-id`).
  Endpoint xem trong `apps/api/src/modules/promotions/infrastructure/http/*.controller.ts`:

  1. Tenant tạo promotion (code mới, `appliesTo:'all'`) → 2xx; psql: `applies_to_id` NULL,
     `created_by_partner_id` NULL, `partner_opt_in_at` NULL.
  2. Tạo lại **cùng code** → 409 body đúng
     `{"statusCode":409,"code":"PROMO_CODE_TAKEN","message":"Code \"<CODE>\" is already in use"}`.
  3. **Tri-state**: PATCH chỉ gửi `{ "name": "..." }` → psql xác nhận các field khác (ví dụ
     `usage_limit_total`, `min_order_amount`) **giữ nguyên**; rồi PATCH `{ "usageLimitTotal": null }`
     → cột đó thành NULL; rồi PATCH `{ "timeWindows": [] }` → cột thành NULL.
  4. Kết thúc promotion → 2xx; **gọi lại lần 2** → 2xx, và psql xác nhận `updated_at` **không đổi**
     (short-circuit của path tenant còn nguyên).
  5. PATCH promotion đã ended → 409 `PROMO_ENDED` 'An ended promotion cannot be edited'.
  6. Partner tạo promotion trên listing của mình → 2xx; psql: `funded_by='partner'`,
     `funding_partner_id` = partner, `partner_opt_in_at` **khác NULL** (auto opt-in),
     `created_by_partner_id` = partner.
  7. Partner khác (hoặc id partner khác) sửa promotion đó → 403 `PROMO_NOT_OWNED` 'Not your promotion'.
  8. Partner tạo promotion trỏ vào listing **không thuộc mình** → 403 `PROMO_SCOPE_NOT_OWNED`; và
     `appliesTo:'all'` → 400 `PROMO_SCOPE_UNSUPPORTED` (message đúng nguyên văn).
  9. Tenant tạo promotion `appliesTo:'listing'` với `appliesToId` là uuid không tồn tại → 400
     `PROMO_SCOPE_TARGET_INVALID`.
  10. Opt-in: tenant tạo promo `fundedBy:'partner'` trỏ listing của partner → partner opt-in lần 1
      → 2xx (psql: `partner_opt_in_at` set; bảng `agreement_acceptances` có row mới); lần 2 → 409
      `PROMO_ALREADY_OPTED_IN` 'Already opted in'.
  11. **Regression PR #5b chưa làm**: đặt 1 booking dùng promo code hợp lệ qua storefront (đường
      prepare/reserve **không đổi** trong PR này) → thành công, `redeemed_count` tăng 1.

- [ ] **Step 5: Commit docs + Push + PR**

```bash
git add apps/api/CLAUDE.md docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md
git commit -m "docs(api): promotions (vòng đời) vào danh sách entity-style + sổ import chéo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin refactor/entity-promotion-lifecycle
gh pr create --base refactor/entity-centric --title "refactor(promotions): PR #5a — Promotion aggregate (vòng đời chương trình)" --body "$(cat <<'EOF'
PR #5a của entity-centric refactor (spec docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md).

Module promotions được tách làm 2 PR vì bề mặt rộng (20 use-case, 2 aggregate, rủi ro rất khác nhau):
- **PR #5a (PR này)** — `Promotion`: 7 use-case ghi vòng đời + 4 helper rule + port/repo phần ghi cấu hình.
- **PR #5b (tiếp theo)** — `PromoRedemption`, `claimUsage`/`releaseUsage`, outbox handler, prepare/reserve. **Không đụng trong PR này.**

Nội dung:
- `Promotion` aggregate: assembly tenant-created vs partner-created (auto opt-in), guard ended/ownership/opt-in, và **khối tri-state merge 11 field trước bị copy y hệt ở 2 use-case nay gom về `applyUpdate`**
- 13 mã lỗi thành domain error (4 helper rule thôi ném HttpException) — code/status/message byte-identical
- Port `create`/`update` nhận `NewPromotion`/`PromotionPatch` thay property-bag

Giữ nguyên tuyệt đối: ngữ nghĩa tri-state (`undefined` giữ / `null` xoá / `timeWindows` rỗng = xoá); check-then-insert + DB unique cho code; mọi validation trong `forTenant` tx; app-clock `utcNow()` cho opt-in; ghi `agreement_acceptances` cùng tx; **bất đối xứng của `end`** (tenant short-circuit, partner ghi vô điều kiện — known gap §8a, có comment tại chỗ).

Verify: pnpm turbo lint typecheck build + check:rls xanh; smoke 11 case gồm tri-state 3 nhánh, end idempotent (kiểm `updated_at` không đổi), 6 nhánh lỗi, opt-in + agreement row, và 1 booking dùng promo để chắc đường prepare/reserve chưa bị ảnh hưởng.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6:** Báo controller — KHÔNG tự merge, KHÔNG tự bắt đầu PR #5b.
