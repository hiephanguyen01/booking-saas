# PR #10a — Tenant + TenantDomain aggregate (tenancy, nửa lõi) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa rule vòng đời tenant và toàn bộ vòng đời domain (token, born-verified, verification
transition, primary election, delete guard) vào aggregate. Wire byte-identical.

**Phạm vi:** module tenancy tách 2 PR vì quá rộng (29 use-case, 4 aggregate, 2 cụm rủi ro khác hẳn nhau):
- **PR #10a (bản plan này)** — `Tenant` + `TenantDomain`/`TenantDomainPortfolio`.
- **PR #10b (sau)** — `SubscriptionPlan` + `TenantSubscription` (catalog plan, stream subscription,
  plan limits, rule "current subscription" đang nhân ba, bigint MRR). **PR này KHÔNG đụng tới chúng.**

**Architecture:** Theo spec
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
§3 + style-gate. Pattern như PR #2/#4/#9: port/use-case làm I/O, truyền dữ kiện đã resolve vào entity.

## Global Constraints

- **KHÔNG test** (ADR 0005); verify = `typecheck` + `lint` + `build` + chạy app.
- **ADR 0006**: không service class; 1 use-case = 1 file, 1 `execute()`.

### ✅ Ngoại lệ wire DUY NHẤT — owner duyệt: hợp nhất `TENANT_NOT_FOUND`

`shared/domain/errors/tenant-not-found.ts` có message **tĩnh** `'Tenant not found'` (reviews,
favorites, catalog… đang dùng). Tenancy phát **cùng code nhưng message động**
`` `Tenant ${id} not found` `` ở **8 chỗ**.

**Owner quyết định (2026-07-24): dùng chung `'Tenant not found'`.** Đây là **thay đổi wire có chủ
đích duy nhất** của PR này — `code` và `status` giữ nguyên (`TENANT_NOT_FOUND` / 404), chỉ message
mất phần uuid. Đã kiểm: **không có chỗ nào ở FE bám vào chuỗi message** (grep dashboard + storefront
= 0 hit), và bỏ uuid khỏi message user-facing là cải thiện nhỏ về lộ thông tin.

**Chuyển đủ cả 8 site trong PR này**, không chia đôi — nếu chỉ đổi 4 site thuộc phạm vi #10a thì
cùng một code sẽ trả 2 message khác nhau tuỳ endpoint, tệ hơn cả hai trạng thái thuần. Danh sách:

| # | File | Thuộc phạm vi |
|---|---|---|
| 1 | `update-tenant.use-case.ts` | #10a |
| 2 | `set-partner-promotions.use-case.ts` | #10a |
| 3 | `set-tenant-default-cancellation-policy.use-case.ts` | #10a |
| 4 | `add-domain.use-case.ts` | #10a |
| 5 | `get-tenant.use-case.ts` | read-side — **ngoại lệ freeze, chỉ đổi dòng throw** |
| 6 | `get-tenant-detail.use-case.ts` | read-side — **ngoại lệ freeze, chỉ đổi dòng throw** |
| 7 | `assign-subscription.use-case.ts` | #10b — **chỉ đổi dòng throw**, không đụng gì khác |
| 8 | `list-subscriptions.use-case.ts` | #10b — **chỉ đổi dòng throw**, không đụng gì khác |

Ở site 5–8 **chỉ được** thay biểu thức throw + import; mọi thứ khác trong file giữ nguyên.
Ghi vào spec như một **approved wire change** (không phải known gap).

### ⛔ Bẫy #2 — hai pool, gần như toàn bộ là admin pool

Module này chạy trên `prisma.admin` (BYPASSRLS) với `tx?` tuỳ chọn; **RLS KHÔNG phải cơ chế cô lập
ở đây**, mà là filter `tenantId` tường minh. Ngoại lệ duy nhất: `set-primary-domain.use-case.ts`
dùng `TenantDbService.forTenant` (app pool, RLS) — và chính RLS ở đó thay cho check ownership.
⇒ **Giữ nguyên tuyệt đối** pool của từng use-case. Đừng "chuẩn hoá" bất kỳ cái nào sang `forTenant`,
cũng đừng bỏ check `domain.tenantId !== tenantId` ở các use-case chạy admin pool (chúng KHÔNG có RLS
đỡ lưng).

### ⛔ Bẫy #3 — worker phải giữ throw-để-retry

`domain-verification.worker.ts:87` ném **`Error` thường** (không phải HttpException) khi TXT chưa
propagate — đó là cách báo BullMQ retry (`attempts: 5`, exponential backoff 5s). **Không được** đổi
thành boolean/no-op. Ba nhánh no-op im lặng (domain đã xoá/đổi tenant, đã verified, không có token)
cũng giữ nguyên là `return`.

### ⛔ Bẫy #4 — thứ tự cache eviction

`cache.invalidateHost` chỉ được gọi **sau khi commit** (create-tenant:74, update-tenant:37,
worker:91). Đưa vào trong transaction (evict rồi rollback) sẽ để tenant sai sống 60s TTL. Negative
caching (host lạ lưu chuỗi rỗng) phải sống sót. Bốn use-case hiện **không** gọi cache
(`add-domain`, `verify-domain`, `delete-domain`, `set-primary-domain`) — **giữ nguyên**, đừng thêm.

### Wire đóng băng — 11 dòng, giữ từng ký tự

| code | status | message | nơi phát |
|---|---|---|---|
| `TENANT_SLUG_TAKEN` | 409 | `` Slug "${slug}" is already in use `` | create-tenant |
| `DOMAIN_TAKEN` | 409 | `` Hostname "${hostname}" is already mapped `` | create-tenant, add-domain |
| ~~`TENANT_NOT_FOUND`~~ | 404 | **ĐỔI CÓ CHỦ ĐÍCH** → `Tenant not found` (shared kernel) | 8 site, xem mục ngoại lệ ở trên |
| `INVALID_CANCELLATION_POLICY` | 400 | `Default must be a tenant-level cancellation policy of this tenant` | set-default-cancellation-policy |
| `DOMAIN_NOT_FOUND` | 404 | `` Domain ${domainId} not found for this tenant `` (**động**) | verify-domain |
| `DOMAIN_NOT_FOUND` | 404 | `Domain not found` (**tĩnh** — cùng code, message KHÁC) | set-primary-domain, delete-domain |
| `DOMAIN_NOT_VERIFIABLE` | 400 | `Domain has no verification token` | verify-domain |
| `DOMAIN_NOT_VERIFIED` | 400 | `A domain must be verified before it can become primary` | set-primary-domain |
| `DOMAIN_PRIMARY_REQUIRED` | 409 | `Cannot remove the only verified primary domain` | delete-domain |

`PLAN_FEATURE_DISABLED` (assert-custom-domain-allowed) và `NO_ACTIVE_PLAN` (plan-limit-errors)
**thuộc PR #10b** — không đụng ở PR này dù `add-domain` có gọi.

### Bề mặt đóng băng xuyên module

- **`ResolveTenantByHostUseCase.execute(host)`** — **14 file** ở 9 module khác gọi. Đây là bề mặt
  xuyên module lớn nhất từ đầu refactor. Use-case này là **read path** ⇒ **KHÔNG đụng gì cả** trong
  PR này (kể cả 2 chỗ throw `UNKNOWN_HOST` và rule inline "chỉ domain verified mới resolve" /
  "tenant.status==='active' && storefrontLive"). Ghi §8b-bis để xử lý sau.
- **`TENANT_REPOSITORY` / `ITenantRepository.findById`** — 3 consumer (partner apply, promotions
  guard, affiliate apply) chỉ gọi `findById`. Giữ nguyên token + chữ ký + shape `TenantRecord`.
- Controller **không đụng** (có bẫy thứ tự route: `GET config`/`GET slug-check` phải đứng trước
  `GET :id`).

### Known gap — GIỮ NGUYÊN, ghi sổ

1. **`add-domain` nhận `isPrimary: true` từ request và KHÔNG clear primary cũ** ⇒ có thể tạo **hai**
   domain primary cho một tenant. Không có DB constraint nào chặn. (Đây là bug thật, nhưng sửa =
   đổi hành vi API ⇒ ghi §8a.)
2. **Không có ràng buộc DB cho "một primary mỗi tenant"** — chỉ dựa vào chuỗi `updateMany` rồi
   `update` trong một tx của `setPrimary`; hai lời gọi đồng thời vẫn đua được. §8b (migration wave)
   đã có mục này.
3. **`delete-domain` thực chất bảo vệ "còn ít nhất một domain verified"**, không phải "còn primary"
   (nó lọc sibling theo `verifiedAt`, không theo `isPrimary`) ⇒ xoá primary khi còn sibling verified
   sẽ để tenant **không có primary nào**. Giữ nguyên.
4. **`delete-domain` / `add-domain` / `set-primary-domain` không invalidate cache** ⇒ host vừa xoá
   vẫn resolve tới 60s. Giữ nguyên (bẫy #4).
5. **Worker: nếu `markVerified` xong mà `invalidateHost` lỗi**, retry sẽ no-op (đã verified) ⇒ cache
   không bao giờ được invalidate, chỉ hết theo TTL. Giữ nguyên.
6. **`set-partner-promotions` read-merge-write không có transaction** ⇒ lost update khi gọi đồng
   thời. Giữ nguyên.
7. **`update-tenant` cho status đi thẳng, không có transition rule nào** (§8a đã ghi cho tenancy).
8. **Race uniqueness leak**: slug/hostname pre-check là advisory; repo không dịch P2002 ⇒ đua đồng
   thời vẫn leak lỗi Prisma thô. Giữ nguyên (cùng loại đã ghi §8a).

### Đóng băng khác

- Read-side: `resolve-tenant-by-host`, `check-slug-availability`, `get-tenant*`, `list-*`, mapper,
  `get-platform-health` — **không đụng**.
- Entity **không** sinh ngẫu nhiên và **không** tự lấy giờ: token hex và `now` do use-case cấp
  (giống luật "clock là tham số").
- Domain framework-free: chỉ `import type` từ `@booking/contracts` + domain nội bộ.
- Node **22.22.0** (`nvm use`), chỉ **pnpm**; smoke dùng `PORT=3001` nếu 3000 bận; không đụng
  container/process project khác.
- Branch **`refactor/entity-tenancy-core`** (đã tạo, base `3d741bc`), PR vào `refactor/entity-centric`.
  **Mọi commit nằm trên nhánh feature** — nhánh tích hợp có PR #25 mở, không đổ thêm vào đó.

---

### Task 1: Domain errors

**Files:** Create `apps/api/src/modules/tenancy/domain/errors/tenancy-errors.ts`

**Interfaces:** Produces — `TenantSlugTaken(slug)`, `DomainTaken(hostname)`,
`InvalidCancellationPolicy`, `DomainNotFoundForTenant(domainId)`, `DomainNotFound`,
`DomainNotVerifiable`, `DomainNotVerified`, `DomainPrimaryRequired`.
**KHÔNG** mint `TENANT_NOT_FOUND` ở đây — dùng `TenantNotFound` của shared kernel (xem mục ngoại lệ).

- [ ] **Step 1: Viết file**

```ts
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the Tenant / TenantDomain aggregates. Codes + statuses +
 * messages are byte-identical to the pre-refactor use-case behaviour, with ONE
 * owner-approved exception: `TENANT_NOT_FOUND` is no longer minted here. Tenancy
 * used to answer `Tenant ${id} not found` while every other module used the shared
 * kernel's `Tenant not found`; the owner chose the shared, id-free message, so all
 * eight tenancy sites now import `shared/domain/errors/tenant-not-found`.
 */

export class TenantSlugTaken extends DomainError {
  constructor(slug: string) {
    super('TENANT_SLUG_TAKEN', 409, `Slug "${slug}" is already in use`);
  }
}

export class DomainTaken extends DomainError {
  constructor(hostname: string) {
    super('DOMAIN_TAKEN', 409, `Hostname "${hostname}" is already mapped`);
  }
}

export class InvalidCancellationPolicy extends DomainError {
  constructor() {
    super(
      'INVALID_CANCELLATION_POLICY',
      400,
      'Default must be a tenant-level cancellation policy of this tenant',
    );
  }
}

/** The verify path answers with the id; the other domain paths do not (see below). */
export class DomainNotFoundForTenant extends DomainError {
  constructor(domainId: string) {
    super('DOMAIN_NOT_FOUND', 404, `Domain ${domainId} not found for this tenant`);
  }
}

/** Same code as {@link DomainNotFoundForTenant} but the static message the
 *  set-primary / delete paths have always returned — the two are NOT interchangeable. */
export class DomainNotFound extends DomainError {
  constructor() {
    super('DOMAIN_NOT_FOUND', 404, 'Domain not found');
  }
}

export class DomainNotVerifiable extends DomainError {
  constructor() {
    super('DOMAIN_NOT_VERIFIABLE', 400, 'Domain has no verification token');
  }
}

export class DomainNotVerified extends DomainError {
  constructor() {
    super('DOMAIN_NOT_VERIFIED', 400, 'A domain must be verified before it can become primary');
  }
}

export class DomainPrimaryRequired extends DomainError {
  constructor() {
    super('DOMAIN_PRIMARY_REQUIRED', 409, 'Cannot remove the only verified primary domain');
  }
}
```

- [ ] **Step 2: Typecheck** exit 0. **Step 3: Commit**

```bash
git add apps/api/src/modules/tenancy/domain/errors
git commit -m "feat(tenancy): domain errors cho Tenant + TenantDomain

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `Tenant` + `TenantDomain` aggregate

**Files:**
- Create `apps/api/src/modules/tenancy/domain/entities/tenant.entity.ts`
- Create `apps/api/src/modules/tenancy/domain/entities/tenant-domain.entity.ts`
- Modify `apps/api/src/modules/tenancy/domain/hostname.ts` (thêm 1 hàm thuần, không sửa hàm cũ)

- [ ] **Step 1: `hostname.ts`** — thêm vào cuối file, **không đụng** `normalizeHostname`,
  `buildDefaultSubdomain`, `domainVerificationRecord`:

```ts
/**
 * The TXT value a custom domain must publish. The random half is supplied by the
 * caller (the domain layer never generates randomness) — today
 * `randomBytes(16).toString('hex')`, i.e. 32 hex chars.
 */
export function buildVerificationToken(randomHex: string): string {
  return `bookify-verify=${randomHex}`;
}
```

- [ ] **Step 2: `domain/entities/tenant.entity.ts`**

```ts
import { InvalidCancellationPolicy } from '../errors/tenancy-errors';

/**
 * Tenant aggregate root (§6) — one business on the platform: profile, lifecycle
 * status, theme, and the settings blob the dashboard toggles.
 *
 * Owns the two write rules that used to sit inline in use-cases:
 *   - toggling `settings.partnerPromotionsEnabled` must MERGE, never replace, so
 *     unrelated settings keys survive ({@link Tenant.togglePartnerPromotions});
 *   - the default cancellation policy must be a tenant-level policy of this very
 *     tenant ({@link Tenant.setDefaultCancellationPolicy}) — the ownership fact is
 *     resolved by the repository and handed in.
 *
 * NOT owned here (deliberately): slug uniqueness (DB unique index + advisory
 * pre-check), status transitions (there are none today — any→any is accepted, a
 * recorded known gap), and storefront liveness, which composes the tenant status
 * with the subscription evaluation on the read path.
 *
 * Framework-free: no Nest, no Prisma.
 */
export type TenantStatus = 'active' | 'suspended' | 'expired';

/** The persisted write-state these rules need. */
export interface TenantState {
  id: string;
  status: TenantStatus;
  settings: Record<string, unknown>;
  defaultCancellationPolicyId: string | null;
}

export class Tenant {
  private constructor(private readonly state: TenantState) {}

  static rehydrate(state: TenantState): Tenant {
    return new Tenant(state);
  }

  get id(): string {
    return this.state.id;
  }

  /**
   * Merge-not-replace: the settings column is a shared blob, so a toggle must
   * preserve every key it does not own.
   */
  togglePartnerPromotions(enabled: boolean): { settings: Record<string, unknown> } {
    return { settings: { ...this.state.settings, partnerPromotionsEnabled: enabled } };
  }

  /**
   * `null` clears the default. A non-null id must belong to this tenant AND be
   * tenant-level (partner_id null) — the repository answers that question.
   */
  setDefaultCancellationPolicy(
    policyId: string | null,
    isTenantLevelPolicy: boolean,
  ): { defaultCancellationPolicyId: string | null } {
    if (policyId !== null && !isTenantLevelPolicy) throw new InvalidCancellationPolicy();
    return { defaultCancellationPolicyId: policyId };
  }
}
```

- [ ] **Step 3: `domain/entities/tenant-domain.entity.ts`**

```ts
import { buildVerificationToken } from '../hostname';
import {
  DomainNotVerifiable,
  DomainNotVerified,
  DomainPrimaryRequired,
} from '../errors/tenancy-errors';

/**
 * TenantDomain aggregate (§6.3) — one hostname mapped to one tenant, plus the
 * portfolio-level rules that need its siblings.
 *
 * Owns:
 *   - provisioning: the platform-owned `<slug>.<baseDomain>` subdomain is trusted, so
 *     it is born verified with no token ({@link TenantDomain.provisionDefaultSubdomain});
 *     a custom domain is born unverified with a `bookify-verify=…` TXT token
 *     ({@link TenantDomain.requestCustomDomain});
 *   - the verification gate ({@link TenantDomain.assertVerifiable}) and the
 *     already-verified short-circuit ({@link TenantDomain.isVerified});
 *   - the primary-election gate ({@link TenantDomain.assertCanBecomePrimary});
 *   - the portfolio rule that the last verified domain cannot be deleted
 *     ({@link assertDeletableFromPortfolio}).
 *
 * NOT owned here (deliberately):
 *   - the atomic clear-old/set-new primary swap — it stays a two-statement
 *     transaction in the repository (spec §3 "CAS ở lại repository"); reconstructing
 *     it from aggregate state would race, and there is no DB constraint to catch that;
 *   - hostname uniqueness (citext unique index; the pre-check is advisory);
 *   - randomness and clocks — the caller supplies `randomHex` and `now`.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** The persisted write-state of one domain row. */
export interface TenantDomainState {
  id: string;
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  verificationToken: string | null;
  verifiedAt: Date | null;
}

/** Validated insert payload (id assigned by the DB). */
export interface NewTenantDomain {
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  verificationToken: string | null;
  verifiedAt: Date | null;
}

export class TenantDomain {
  private constructor(private readonly state: TenantDomainState) {}

  static rehydrate(state: TenantDomainState): TenantDomain {
    return new TenantDomain(state);
  }

  /** The `<slug>.<baseDomain>` subdomain we own: primary and verified from birth. */
  static provisionDefaultSubdomain(input: {
    tenantId: string;
    hostname: string;
    now: Date;
  }): NewTenantDomain {
    return {
      tenantId: input.tenantId,
      hostname: input.hostname,
      isPrimary: true,
      verificationToken: null,
      verifiedAt: input.now,
    };
  }

  /**
   * A customer-owned hostname: unverified until the TXT record shows up.
   * NOTE: `isPrimary` is taken from the caller as-is — today the API lets a request
   * set it without clearing an existing primary, which is a recorded known gap; this
   * factory preserves that behaviour rather than silently tightening it.
   */
  static requestCustomDomain(input: {
    tenantId: string;
    hostname: string;
    isPrimary: boolean;
    randomHex: string;
  }): NewTenantDomain {
    return {
      tenantId: input.tenantId,
      hostname: input.hostname,
      isPrimary: input.isPrimary,
      verificationToken: buildVerificationToken(input.randomHex),
      verifiedAt: null,
    };
  }

  get id(): string {
    return this.state.id;
  }

  get hostname(): string {
    return this.state.hostname;
  }

  get isVerified(): boolean {
    return this.state.verifiedAt !== null;
  }

  get isPrimary(): boolean {
    return this.state.isPrimary;
  }

  get belongsToTenant(): string {
    return this.state.tenantId;
  }

  /** A domain with no token has nothing to check against — verification is impossible. */
  assertVerifiable(): void {
    if (this.state.verificationToken === null) throw new DomainNotVerifiable();
  }

  /** Only a verified domain may carry the storefront. */
  assertCanBecomePrimary(): void {
    if (!this.isVerified) throw new DomainNotVerified();
  }
}

/**
 * Portfolio rule: removing a verified primary domain is refused while it is the
 * tenant's only verified one — a live storefront must never be orphaned.
 *
 * NOTE the asymmetry, preserved from the pre-refactor code: siblings are filtered by
 * `verified`, NOT by `primary`. So deleting the primary while another verified (but
 * non-primary) domain exists succeeds and leaves the tenant with no primary at all.
 * Recorded as a known gap rather than tightened here.
 */
export function assertDeletableFromPortfolio(
  target: { isPrimary: boolean; isVerified: boolean },
  siblings: readonly { isVerified: boolean }[],
): void {
  if (!target.isPrimary || !target.isVerified) return;
  if (siblings.some((s) => s.isVerified)) return;
  throw new DomainPrimaryRequired();
}
```

- [ ] **Step 4: Typecheck** exit 0 (chưa ai import — chỉ cần compile sạch). **Step 5: Commit**

```bash
git add apps/api/src/modules/tenancy/domain
git commit -m "feat(tenancy): Tenant + TenantDomain aggregate + buildVerificationToken

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire 4 use-case của Tenant

**Files:** `create-tenant`, `update-tenant`, `set-partner-promotions`,
`set-tenant-default-cancellation-policy` (đều trong `application/use-cases/`).

- [ ] **Step 1: `create-tenant.use-case.ts`** — giữ nguyên **thứ tự và pool** từng bước
  (findBySlug → findByHostname → `runInTransaction` → cache sau commit). Chỉ thay:
  - throw slug → `throw new TenantSlugTaken(input.slug);`
  - throw hostname → `throw new DomainTaken(subdomain);`
  - literal domain trong tx → `TenantDomain.provisionDefaultSubdomain({ tenantId: tenant.id, hostname: subdomain, now: new Date() })`
    (giữ đúng nguồn clock hiện tại là `new Date()` của app).
  - **giữ nguyên** comment giải thích tx và comment "born verified".

- [ ] **Step 2: `update-tenant.use-case.ts`** — chỉ đổi throw → `new TenantNotFound()` (import từ
  `shared/domain/errors/tenant-not-found`). **Không** thêm transition rule cho `status`
  (known gap #7). Giữ nguyên nhánh `if (input.status !== undefined)` + vòng `invalidateHost` sau update.

- [ ] **Step 3: `set-partner-promotions.use-case.ts`** — throw → `new TenantNotFound()`;
  khối spread-merge → `Tenant.rehydrate(tenant).togglePartnerPromotions(enabled)` rồi truyền kết quả
  vào `tenants.update(tenantId, patch)`. Giữ nguyên: không transaction, không cache (known gap #6).

- [ ] **Step 4: `set-tenant-default-cancellation-policy.use-case.ts`** — throw 404 →
  `new TenantNotFound()`; giữ nguyên lời gọi `tenants.isTenantLevelPolicy(...)` **chỉ khi
  `policyId !== null`** (đúng như hiện tại), rồi
  `Tenant.rehydrate(tenant).setDefaultCancellationPolicy(policyId, isTenantLevel)` → patch →
  `tenants.update`. Lưu ý: khi `policyId === null` thì **không** gọi `isTenantLevelPolicy`; truyền
  `true` cho tham số đó cũng được vì entity bỏ qua khi `policyId === null` — nhưng phải giữ đúng
  việc **không phát sinh query thừa**.

- [ ] **Step 5: Hợp nhất `TENANT_NOT_FOUND` ở 4 site còn lại** (quyết định owner — xem mục ngoại lệ).
  Trong `get-tenant.use-case.ts`, `get-tenant-detail.use-case.ts`, `assign-subscription.use-case.ts`,
  `list-subscriptions.use-case.ts`: **chỉ** thay biểu thức `throw new NotFoundException({...})` bằng
  `throw new TenantNotFound();` + thêm import, và bỏ import `NotFoundException` nếu không còn dùng.
  **Tuyệt đối không** đụng bất cứ dòng nào khác trong 4 file này (2 file là read-side, 2 file thuộc
  PR #10b). Sau bước này, grep `Tenant \${` trong `modules/tenancy` phải ra 0 hit.

- [ ] **Step 6: Typecheck + lint** exit 0. **Step 7: Commit**

```bash
git add apps/api/src/modules/tenancy
git commit -m "refactor(tenancy): 4 use-case Tenant qua aggregate + hợp nhất TENANT_NOT_FOUND

Owner duyệt đổi wire: message động 'Tenant \${id} not found' → 'Tenant not found'
dùng chung shared kernel, áp cho cả 8 site để không nửa vời. Code + status không đổi.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire 4 use-case Domain + worker

**Files:** `add-domain`, `verify-domain`, `set-primary-domain`, `delete-domain` +
`infrastructure/domain-verification.worker.ts`.

- [ ] **Step 1: `add-domain.use-case.ts`** — giữ nguyên thứ tự (findById tenant →
  `assertCustomDomainAllowed` → findByHostname → create) và pool (admin, 3 statement rời, không tx).
  Thay: 404 → `new TenantNotFound()` (shared kernel); 409 → `new DomainTaken(hostname)`; khối literal
  create → `TenantDomain.requestCustomDomain({ tenantId, hostname, isPrimary: input.isPrimary, randomHex: randomBytes(16).toString('hex') })`.
  **`randomBytes` ở lại use-case** (entity không sinh ngẫu nhiên). **Không** thêm clear-primary
  (known gap #1). **Không** thêm cache call (known gap #4).

- [ ] **Step 2: `verify-domain.use-case.ts`** — thay 404 → `new DomainNotFoundForTenant(domainId)`
  (**message động** — khác với 2 use-case kia); giữ nguyên check ownership thủ công
  `domain.tenantId !== tenantId` (admin pool, không có RLS); short-circuit đã verified →
  `if (d.isVerified) return { status: 'verified', domain };`; token → `d.assertVerifiable()`;
  giữ nguyên `queue.enqueue` và giá trị trả về `{ status: 'checking', domain }`.

- [ ] **Step 3: `set-primary-domain.use-case.ts`** — **giữ nguyên `forTenant`** (đây là use-case duy
  nhất dùng app pool; RLS thay cho check ownership). Thay: 404 → `new DomainNotFound()` (**message
  tĩnh**); 400 → `d.assertCanBecomePrimary()`; giữ nguyên short-circuit
  `if (d.isPrimary) return domain;` và lời gọi `domains.setPrimary(tenantId, id, tx)` — **atomic swap
  ở lại repository**, không dựng lại từ state.

- [ ] **Step 4: `delete-domain.use-case.ts`** — thay 404 → `new DomainNotFound()`; khối lọc sibling →

  ```ts
      const target = TenantDomain.rehydrate(domain);
      if (target.isPrimary && target.isVerified) {
        const siblings = (await this.domains.listByTenant(tenantId))
          .filter((d) => d.id !== id)
          .map((d) => ({ isVerified: d.verifiedAt !== null }));
        assertDeletableFromPortfolio(
          { isPrimary: target.isPrimary, isVerified: target.isVerified },
          siblings,
        );
      }
      await this.domains.delete(id);
  ```
  Giữ nguyên: check ownership thủ công, việc chỉ gọi `listByTenant` khi target là primary+verified
  (không phát sinh query thừa), pool admin, không tx, không cache.

- [ ] **Step 5: `domain-verification.worker.ts`** — chỉ thay 3 nhánh no-op và điều kiện bằng entity
  cho dễ đọc, **giữ nguyên tuyệt đối**: 3 `return` im lặng, `throw new Error(...)` khi TXT chưa có
  (bẫy #3), thứ tự `markVerified` rồi `invalidateHost`, và config retry. Nếu việc dùng entity ở đây
  không làm rõ hơn thì **để nguyên file** — ghi lý do trong report.

- [ ] **Step 6: Typecheck + lint + build** exit 0.
- [ ] **Step 7: Đối chiếu** — `git diff HEAD -- apps/api/src/modules/tenancy`:

  | Điểm | Kỳ vọng |
  |---|---|
  | Các dòng wire | code/status/message y hệt, **kể cả 2 message khác nhau của `DOMAIN_NOT_FOUND`** (một động cho verify, một tĩnh cho set-primary/delete) |
  | `TENANT_NOT_FOUND` | đúng 8 site đều dùng `TenantNotFound` của shared kernel; `grep "Tenant \${"` trong module ra 0 hit |
  | Pool từng use-case | không đổi; chỉ `set-primary-domain` dùng `forTenant` |
  | `setPrimary` atomic swap | vẫn ở repo, không dựng lại từ state |
  | Cache | đúng 3 call site cũ, đều sau commit; 4 use-case kia vẫn không gọi |
  | Worker | vẫn `throw new Error` khi TXT chưa có; 3 no-op còn nguyên; retry config không đổi |
  | `resolve-tenant-by-host`, read-side, controller, mapper | không đụng |
  | `TENANT_REPOSITORY`/`findById`/`TenantRecord` | không đổi |

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/tenancy
git commit -m "refactor(tenancy): 4 use-case Domain qua TenantDomain aggregate

Token format + born-verified + verification gate + primary gate + portfolio delete
rule vào entity. Atomic swap setPrimary ở lại repo; worker giữ throw-để-retry.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Docs + verify + smoke + PR

- [ ] **Step 1: Docs**
  - `apps/api/CLAUDE.md`: thêm `tenancy (Tenant + domains — PR #10a)` vào danh sách.
  - Spec §8a: thêm 2 dòng — (a) `add-domain` cho phép tạo primary thứ hai (không clear primary cũ,
    không có DB constraint); (b) `delete-domain` thực chất bảo vệ "còn domain verified" chứ không
    phải "còn primary".
  - Spec: thêm mục **"Wire change đã duyệt"** (mục mới, không phải known gap) ghi:
    `TENANT_NOT_FOUND` của tenancy đổi message từ `` `Tenant ${id} not found` `` sang
    `Tenant not found` dùng chung shared kernel — owner duyệt 2026-07-24, áp cho cả 8 site, code và
    status không đổi, FE không bám vào message (đã grep). Đây là **thay đổi wire có chủ đích duy
    nhất** của toàn bộ refactor tính tới PR #10a.
  - Spec §8b-bis: thêm — `resolve-tenant-by-host` còn rule inline ("chỉ verified mới resolve",
    "isLive = status active && storefrontLive") nhưng là read path có **14 consumer xuyên module**,
    để refactor riêng; và 4 use-case domain không invalidate cache (host xoá rồi vẫn sống 60s).
  - `docs/refactor/HANDOFF.md` §1: `| 10a | tenancy — Tenant + domains | 🔍 review (GitHub PR #NN) |`,
    và ghi module kế tiếp là **PR #10b** (Plan + Subscription) kèm gợi ý: rule "current subscription"
    đang nhân ba (1 TS + 2 raw SQL) — hợp nhất; `create-plan` thiếu pre-check tên nên leak P2002;
    repricing cần confirm khi có subscriber; bigint MRR không được đi qua `Number()`.

- [ ] **Step 2: Full suite** — `nvm use`; `pnpm turbo lint typecheck build` + `check:rls` xanh.
- [ ] **Step 3: Hạ tầng + API** — `docker ps`; boot riêng API (`PORT=3001` nếu bận); kill khi xong.
- [ ] **Step 4: Headless smoke** — đăng nhập platform admin `admin@bookify.local` /
  `admin-dev-password` (endpoint trong `infrastructure/http/admin-tenant.controller.ts`), tenant
  owner `owner@studiohub.vn` cho các route tenant-self-service:

  1. **Tạo tenant** slug mới → 2xx; psql: có row `tenants` + row `tenant_domains` với
     `is_primary=true`, `verified_at` khác NULL, `verification_token` NULL (born verified).
  2. **Tạo tenant trùng slug** → 409 body chính xác
     `{"statusCode":409,"code":"TENANT_SLUG_TAKEN","message":"Slug \"<slug>\" is already in use"}`.
  3. **PATCH tenant** đổi `name` → 2xx, và kiểm `settings` trong psql **không đổi**.
  4. **PATCH tenant id không tồn tại** → 404 body chính xác
     `{"statusCode":404,"code":"TENANT_NOT_FOUND","message":"Tenant not found"}`
     (⚠️ đây là **wire change đã duyệt**: trước đây trả `Tenant <uuid> not found`). Kiểm thêm ít
     nhất 2 site nữa trong 8 site — 1 cái read-side (`GET /admin/tenants/<uuid lạ>`) và 1 cái thuộc
     #10b (`POST .../subscriptions` với tenant lạ) — đều phải trả đúng message mới.
  5. **Bật/tắt partner promotions** → 2xx; psql: `settings` giữ nguyên các key khác, chỉ
     `partnerPromotionsEnabled` đổi.
  6. **Set default cancellation policy** bằng một policy **của partner** (không phải tenant-level)
     → 400 `INVALID_CANCELLATION_POLICY` message chính xác. Rồi set `null` → 2xx, cột về NULL.
  7. **Thêm custom domain** → 2xx; psql: `verification_token` khớp dạng `bookify-verify=<32 hex>`,
     `verified_at` NULL.
  8. **Thêm domain trùng hostname** → 409 `DOMAIN_TAKEN` message chính xác.
  9. **Verify domain vừa thêm** (TXT chưa tồn tại) → 2xx `{status:'checking'}`; và verify một domain
     **đã verified** → 2xx `{status:'verified'}` (short-circuit). Verify domain id lạ → 404 message
     **động** `Domain <uuid> not found for this tenant`.
  10. **Set primary** một domain **chưa verified** → 400 `DOMAIN_NOT_VERIFIED` message chính xác.
      Set primary domain đã verified → 2xx; psql: **đúng một** row `is_primary=true` cho tenant đó.
  11. **Xoá domain primary duy nhất đã verified** → 409 `DOMAIN_PRIMARY_REQUIRED`. Xoá domain
      chưa verified → 2xx.
  12. **Regression xuyên module**: gọi một endpoint storefront bất kỳ resolve theo Host
      (`Host: localhost`) → vẫn 2xx (chứng minh `ResolveTenantByHostUseCase` không bị ảnh hưởng).

  Case nào không dựng được headless thì **nói rõ**, đừng bịa.

- [ ] **Step 5: Commit docs + Push + PR** vào `refactor/entity-centric`, body nêu rõ: 2 aggregate,
  bẫy `TenantNotFound` shared-vs-local, giữ nguyên 2 pool, atomic swap ở repo, worker throw-để-retry,
  8 known gap giữ nguyên (đặc biệt **bug hai primary domain** — phát hiện nhưng không sửa vì
  behavior-preserving), `resolve-tenant-by-host` không đụng vì 14 consumer.

- [ ] **Step 6:** Báo controller — KHÔNG tự merge, KHÔNG tự bắt đầu PR #10b.
