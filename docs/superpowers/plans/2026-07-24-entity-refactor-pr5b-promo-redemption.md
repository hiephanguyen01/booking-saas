# PR #5b — PromoRedemption + usage claim — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nửa còn lại của promotions — vòng đời **redemption** (reserved→applied→released) và
**usage claim/release**. Đây là đường đi đồng thời nguy hiểm nhất đã gặp: advisory lock, 4 conditional
UPDATE, outbox at-least-once, và composition **trong tx của module booking**. Mục tiêu là đặt tên và
gom rule vào domain **mà không đụng một ký tự nào của cơ chế đồng thời**.

**Architecture:** Theo spec
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
§3 (đặc biệt luật **CAS ở lại repository**) + style-gate. Entity chỉ *phát biểu* rule; mọi guard vẫn
là SQL có điều kiện trong repo.

## Global Constraints

- **KHÔNG test** (ADR 0005); verify = `typecheck` + `lint` + `build` + chạy app.
- **ADR 0006**: không service class; 1 use-case = 1 file, 1 `execute()`.

### ⛔ Bốn cái bẫy — đọc kỹ trước khi sửa bất cứ dòng nào

1. **KHÔNG đổi `rejectionException` sang `DomainError`.** `confirm-booking.use-case.ts:80` bắt lỗi
   bằng `err instanceof ConflictException` để **nuốt** `PROMO_LIMIT_REACHED` trên đường late-webhook.
   Đổi sang `DomainError` ⇒ `instanceof` sai ⇒ lỗi bị ném tiếp ⇒ **tx confirm rollback** ⇒ booking đã
   thanh toán không confirm được. Giữ nguyên `promo-rejection.ts` và mọi throw đi qua nó. (Việc hợp
   nhất sang DomainError để dành cho PR #14 booking, khi cả hai phía sửa cùng lúc — ghi §8c-bis.)
   Lưu ý thêm: `rejectionException` đặt `message === code` (vd `message: 'PROMO_LIMIT_REACHED'`) —
   nếu sau này chuyển đổi thì phải giữ đúng đặc điểm đó.
2. **Thứ tự trong `ReservePromotionUseCase` là bất khả xâm phạm**: `pg_advisory_xact_lock(...)` phải
   chạy **TRƯỚC** `countActiveByCustomer`, cả hai trong **tx của caller** (booking), và chỉ khi
   `usageLimitPerCustomer !== null`. Đảo thứ tự hoặc đưa ra khỏi tx = mở lại race per-customer cap.
3. **`usageLimitPerCustomer: null` từ `confirm-booking` là cố ý** (bỏ qua cap khi khôi phục
   late-webhook, §8.2 chấp nhận overshoot tạm). Không được "sửa" thành luôn kiểm cap.
4. **4 outbox handler hiện KHÔNG bao giờ throw vì lý do nghiệp vụ** (mọi repo call đều là conditional
   update, no-op êm). Relay at-least-once **không có dead-letter** — thêm bất kỳ throw nghiệp vụ nào
   sẽ kẹt event vĩnh viễn.

### Đóng băng

- **Surface xuyên module (frozen)**: `PreparePromotionUseCase.execute(tx, params)` và
  `ReservePromotionUseCase.execute(tx, tenantId, data)` — booking import trực tiếp
  (`create-booking.use-case.ts:20-21,330,430`, `confirm-booking.use-case.ts:4,70`). **Không đổi tên,
  chữ ký, vị trí file, thứ tự tham số.** Cả hai nhận `tx` từ caller và **không được tự mở
  `forTenant`**.
- **`PromotionSnapshot` được lưu trên booking row** (`promotion-application.ts`, bigint→string trong
  `snapshotOf`) — không đụng shape, không đụng chỗ chuyển kiểu.
- **Wire byte-identical**: mọi mã lỗi qua `rejectionException` giữ nguyên
  (`PROMO_NOT_APPLICABLE`/400, `PROMO_NOT_FOUND`/400, `PROMO_LIMIT_REACHED`/409, và mọi
  `PromoRejection` khác/400) — cả `code` lẫn `message` (message = code).
- **CAS giữ nguyên hình dạng SQL**: `claimUsage` (`status='active' AND (usage_limit_total IS NULL OR
  redeemed_count < usage_limit_total)`), `releaseUsage` (`redeemed_count > 0`), `markApplied`
  (`WHERE booking_id=… AND status='reserved'`), `release` (`WHERE … status IN ('reserved','applied')
  RETURNING promotion_id`). Entity **không** được thay bằng load-check-save.
- **Không đụng schema** — unique `promo_redemptions(booking_id)` vẫn là trọng tài 1:1.
- **Read-side đóng băng**: `usageStats`, `countActiveByCustomer` (chữ ký), `PromoUsageStatsUseCase`,
  và **toàn bộ `PreparePromotionUseCase`** (chỉ đọc + đánh giá; PR này không đổi logic của nó).
- **Clock**: không có clock nào trong đường này ngoài `now()` của SQL — giữ nguyên.
- Domain framework-free. Style-gate: private `_x` + accessor, defensive branch dùng `Error` thường.
- **Ngoại lệ được phép đổi hành vi (spec §4)**: khi PR đụng file đăng ký outbox thì thay
  `event.tenantId ?? ''` bằng validate-and-skip-with-log — **giống hệt cách đã làm ở PR #3**
  (`notification.module.ts`). Skip (không throw) là bắt buộc.
- Node **22.22.0** (`nvm use`), chỉ **pnpm**. Không đụng container/process project khác; smoke dùng
  `PORT=3001` nếu 3000 bận.
- Branch **`refactor/entity-promo-redemption`** (từ `refactor/entity-centric`), PR vào
  `refactor/entity-centric`.

---

### Task 1: Branch + domain — PromoRedemption + policy

**Files:**
- Create: `apps/api/src/modules/promotions/domain/entities/promo-redemption.entity.ts`

**Interfaces:** Produces — type `PromoRedemptionStatus` (re-export vị trí mới, xem Task 2), interface
`NewPromoRedemption`; class `PromoRedemption` với `static open(input): NewPromoRedemption`; pure
functions `exceedsPerCustomerLimit(used, limit)` và `releasesUsageOnCancel(refundPercent)`.

- [ ] **Step 1: Tạo branch**

```bash
cd "/Volumes/OVEN Duy/temp/booking-saas"
git checkout refactor/entity-centric && git pull origin refactor/entity-centric
git checkout -b refactor/entity-promo-redemption
```

- [ ] **Step 2: Viết `domain/entities/promo-redemption.entity.ts`**

```ts
/**
 * PromoRedemption aggregate (§12.3/§12.5) — one customer's claimed use of one
 * promotion, strictly 1:1 with a booking (the `promo_redemptions(booking_id)` unique
 * index is what makes that true).
 *
 * Lifecycle:  reserved ──booking.confirmed──▶ applied
 *                │                              │
 *                └──expired/rejected/100%-cancel─┴──▶ released  (frees one usage)
 *
 * Owns: the shape of a new reservation, the per-customer cap comparison, and the
 * rule that only a FULL refund returns the usage (that last one used to live in the
 * outbox handler registration, i.e. in infrastructure wiring).
 *
 * Explicitly NOT owned — and this is the whole point of the module (spec §3, "CAS ở
 * lại repository"): every transition is a conditional UPDATE in the repository
 * (`WHERE status='reserved'`, `WHERE status IN ('reserved','applied') RETURNING`,
 * `redeemed_count < usage_limit_total`, `redeemed_count > 0`). Those SQL guards are
 * the real state machine — they serialize concurrent claimers and make at-least-once
 * outbox redelivery a no-op. This entity states the rules; it never re-implements
 * them in memory, because a load-check-save version would reintroduce a lost update.
 *
 * Framework-free: no Nest, no Prisma.
 */

/** Validated insert payload for a brand-new reservation (id/timestamps by the DB). */
export interface NewPromoRedemption {
  promotionId: string;
  bookingId: string;
  customerId: string;
  discountAmount: bigint;
}

export class PromoRedemption {
  private constructor() {}

  /** A reservation always enters at `reserved`; the repository row defaults that status. */
  static open(input: {
    promotionId: string;
    bookingId: string;
    customerId: string;
    discountAmount: bigint;
  }): NewPromoRedemption {
    return {
      promotionId: input.promotionId,
      bookingId: input.bookingId,
      customerId: input.customerId,
      discountAmount: input.discountAmount,
    };
  }
}

/**
 * §12.3 per-customer cap. The comparison is the rule; the serialisation is not —
 * the caller must hold the (promotion, customer) advisory lock for the answer to be
 * trustworthy, and both must sit inside the reservation transaction.
 */
export function exceedsPerCustomerLimit(used: number, limit: number): boolean {
  return used >= limit;
}

/**
 * §12.5 — only a FULL refund returns the usage to the pool; a partial refund keeps
 * the redemption `applied` (the customer did consume the promotion). Used by the
 * `booking.cancelled` outbox handler, where this rule used to be inline.
 */
export function releasesUsageOnCancel(refundPercent: number | undefined): boolean {
  return refundPercent === 100;
}
```

- [ ] **Step 3: Typecheck** — `pnpm --filter=@booking/api typecheck`, exit 0.
- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/promotions/domain/entities/promo-redemption.entity.ts
git commit -m "feat(promotions): PromoRedemption aggregate + policy cap/full-refund

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Port + repo — payload aggregate + advisory lock vào port

**Files:**
- Modify: `apps/api/src/modules/promotions/domain/ports/promo-redemption-repository.port.ts`
- Modify: `apps/api/src/modules/promotions/infrastructure/repositories/prisma-promo-redemption.repository.ts`

**Lý do đổi:** `ReservePromotionUseCase` hiện tự chạy `tx.$executeRaw(... pg_advisory_xact_lock ...)`
— tức tầng application viết SQL thô. Đưa nó xuống port là đúng chỗ **và không đổi thứ tự thực thi**.

- [ ] **Step 1: Port** — trong `promo-redemption-repository.port.ts`:
  - thêm `import type { NewPromoRedemption } from '../entities/promo-redemption.entity';`
  - xoá interface `CreateRedemptionData`, đổi `reserve` thành
    `reserve(tx: PrismaTx, tenantId: string, redemption: NewPromoRedemption): Promise<void>;`
  - thêm method mới **ngay trên** `countActiveByCustomer`:

    ```ts
      /**
       * Serialise reservations of one promotion by one customer for the rest of the
       * transaction, so two concurrent tabs cannot both pass the per-customer cap
       * (§12.3). Must be taken BEFORE {@link countActiveByCustomer} and released by
       * the transaction ending — never call it outside the reservation tx.
       */
      lockPerCustomer(tx: PrismaTx, promotionId: string, customerId: string): Promise<void>;
    ```
  - giữ nguyên `PromoRedemptionStatus`, `RedemptionUsageStats`, `markApplied`, `release`,
    `usageStats`, `countActiveByCustomer` (chữ ký + doc comment).

- [ ] **Step 2: Repo** — trong `prisma-promo-redemption.repository.ts`:
  - đổi kiểu tham số của `reserve` sang `NewPromoRedemption` (**thân hàm giữ nguyên**: vẫn
    `tx.promoRedemption.create({ data: { tenantId, …, status: 'reserved' } })`)
  - thêm implement mới, **copy đúng câu SQL đang nằm trong use-case**:

    ```ts
      async lockPerCustomer(tx: PrismaTx, promotionId: string, customerId: string): Promise<void> {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${promotionId}), hashtext(${customerId}))`,
        );
      }
    ```
  - **không đụng** `markApplied`, `release`, `usageStats`, `countActiveByCustomer`.

- [ ] **Step 3: Typecheck** (sẽ đỏ ở use-case cho tới Task 3 — chấp nhận; chỉ cần xác nhận lỗi duy
  nhất là do `reserve`/lock chưa được wire, không phải lỗi khác). Ghi output vào report.
- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/promotions/domain/ports/promo-redemption-repository.port.ts apps/api/src/modules/promotions/infrastructure/repositories/prisma-promo-redemption.repository.ts
git commit -m "refactor(promotions): reserve nhận NewPromoRedemption + advisory lock xuống port

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Use-case reserve + outbox wiring

**Files:**
- Modify: `apps/api/src/modules/promotions/application/use-cases/reserve-promotion.use-case.ts`
- Modify: `apps/api/src/modules/promotions/infrastructure/http/promotions.module.ts`

- [ ] **Step 1: `reserve-promotion.use-case.ts`** — giữ **nguyên** chữ ký `execute(tx, tenantId,
  data)` và toàn bộ thứ tự. Chỉ thay 3 chỗ:
  - khối lock: `await tx.$executeRaw(Prisma.sql\`SELECT pg_advisory_xact_lock(...)\`)` →
    `await this.redemptions.lockPerCustomer(tx, data.promotionId, data.customerId);`
  - so sánh cap: `if (used >= data.usageLimitPerCustomer) throw rejectionException('PROMO_LIMIT_REACHED');`
    → `if (exceedsPerCustomerLimit(used, data.usageLimitPerCustomer)) throw rejectionException('PROMO_LIMIT_REACHED');`
  - lời gọi reserve: truyền `PromoRedemption.open({ promotionId, bookingId, customerId, discountAmount })`
    thay vì object literal.
  Giữ nguyên: điều kiện `usageLimitPerCustomer !== null`, `claimUsage` + throw khi false, **thứ tự
  lock → count → so sánh → claimUsage → reserve**, và `rejectionException` (KHÔNG đổi sang
  DomainError — bẫy #1). Bỏ import `Prisma` nếu không còn dùng.

- [ ] **Step 2: `promotions.module.ts`** — 2 thay đổi:

  **(a) Rule full-refund về domain.** Thay nhánh `booking.cancelled`:

  ```ts
      this.registry.register('booking.cancelled', (event) => {
        const tenantId = this.requireTenantId(event.eventType, event.tenantId);
        if (!tenantId) return Promise.resolve();
        const p = event.payload as { bookingId: string; refundPercent?: number };
        // §12.5: only a full refund returns the usage; a partial refund keeps it `applied`.
        if (!releasesUsageOnCancel(p.refundPercent)) return Promise.resolve();
        return this.releasePromotion.execute(tenantId, p.bookingId);
      });
  ```

  **(b) `event.tenantId ?? ''` → validate-and-skip** cho cả 4 handler, dùng đúng helper như PR #3
  (`notification.module.ts` — đọc file đó để copy nguyên văn phong):

  ```ts
    private readonly logger = new Logger(PromotionsModule.name);

    /**
     * A tenant-scoped promo event without a tenant id cannot be routed: skip it (and
     * say so) instead of running `forTenant('')`, which silently resolved to an empty
     * RLS scope and no-op'd. Skipping — not throwing — keeps the at-least-once relay
     * from parking the event in permanent retry (there is no dead-letter queue).
     */
    private requireTenantId(eventType: string, tenantId: string | null): string | null {
      if (tenantId) return tenantId;
      this.logger.warn(`skipping ${eventType}: outbox event has no tenantId`);
      return null;
    }
  ```
  Áp cho `booking.confirmed`, `booking.expired`, `booking.rejected` theo cùng khuôn (mỗi handler
  trả `Promise.resolve()` khi thiếu tenantId). **Không handler nào được throw.**

  Giữ nguyên: danh sách event đăng ký, `bookingIdOf`, mọi provider/DI, và import chéo module partner
  (`AGREEMENT_REPOSITORY` — vi phạm ADR có sẵn, đã ghi §8c-bis mục 5).

- [ ] **Step 3: Typecheck + lint + build** — cả 3 exit 0.

- [ ] **Step 4: Đối chiếu (đọc, không chạy)** — `git diff HEAD -- apps/api/src/modules/promotions`:

  | Điểm | Kỳ vọng |
  |---|---|
  | Chữ ký `Prepare`/`Reserve` use-case | không đổi (booking import trực tiếp) |
  | Thứ tự lock → count → compare → claimUsage → reserve | không đổi |
  | Nhánh `usageLimitPerCustomer !== null` | không đổi |
  | `rejectionException` | còn nguyên, không chỗ nào thành DomainError |
  | 4 câu SQL guard (claim/release/markApplied/release-redemption) | không đổi một ký tự |
  | 4 handler outbox | vẫn không throw nghiệp vụ; thêm skip-with-log khi thiếu tenantId |
  | `refundPercent === 100` | nay là `releasesUsageOnCancel(...)`, cùng kết quả |

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/promotions
git commit -m "refactor(promotions): reserve qua PromoRedemption + rule full-refund về domain

Advisory lock xuống port (thứ tự lock→count giữ nguyên); handler outbox validate
tenantId thay forTenant(''). rejectionException giữ nguyên có chủ đích: booking
confirm bắt ConflictException để nuốt PROMO_LIMIT_REACHED.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Dọn nợ §8c-bis mục 6 + docs

**Files:**
- Modify: `apps/api/src/modules/promotions/application/assert-scope-target.ts` (xoá hằng số chết)
- Modify: `apps/api/src/modules/promotions/application/assert-tenant-share-risk.ts` (xoá hằng số chết)
- Create: `apps/api/src/modules/promotions/application/to-promotion-update-input.ts`
- Modify: `apps/api/src/modules/promotions/application/use-cases/update-promotion.use-case.ts`
- Modify: `apps/api/src/modules/promotions/application/use-cases/update-partner-promotion.use-case.ts`
- Modify: `apps/api/CLAUDE.md`, `docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md`

- [ ] **Step 1: Xoá 2 hằng số chết** — `PROMO_SCOPE_TARGET_INVALID_CODE` và
  `PROMO_TENANT_SHARE_NEGATIVE_CODE` (0 consumer toàn repo — grep xác nhận lại trước khi xoá).

- [ ] **Step 2: Gom khối chuyển kiểu trùng.** Hai use-case update đang có **khối ~20 dòng y hệt**
  chuyển `vnd()`/`new Date()` trước khi gọi `applyUpdate`. Tạo
  `application/to-promotion-update-input.ts`:

  ```ts
  import { vnd } from '../../../shared/money/money';
  import type { PromotionUpdateInput } from '../domain/entities/promotion.entity';

  /**
   * The wire→domain conversion shared by the tenant and partner update use-cases.
   * Both contract inputs carry the same 11 optional fields; keeping ONE converter is
   * what stops the tri-state contract (`undefined` keep / `null` clear) from silently
   * drifting between the two paths. Presence is preserved key-by-key: a key absent
   * here means "leave the stored value alone".
   */
  export function toPromotionUpdateInput(input: {
    name?: string;
    discountType?: 'percent' | 'fixed';
    discountValue?: string | number;
    maxDiscount?: string | number | null;
    minOrderAmount?: string | number | null;
    firstBookingOnly?: boolean;
    usageLimitTotal?: number | null;
    usageLimitPerCustomer?: number | null;
    timeWindows?: PromotionUpdateInput['timeWindows'];
    startsAt?: string | null;
    endsAt?: string | null;
    status?: 'draft' | 'active' | 'paused';
  }): PromotionUpdateInput {
    /* …chuyển đúng như 2 khối cũ, key-by-key… */
  }
  ```
  **Quan trọng:** kiểu tham số phải khớp thực tế của `UpdatePromotionInput` và
  `UpdatePartnerPromotionInput` (đọc `packages/contracts` để lấy đúng kiểu từng field — ví dụ tiền
  có thể là `string` chứ không phải `string | number`). Nếu 2 contract lệch nhau ở field nào thì
  **dừng lại, báo cáo** thay vì ép kiểu. Thân hàm sao chép nguyên văn logic của khối cũ (giữ cả cách
  xử lý `null` không đi qua `vnd()`/`new Date()`).
  Rồi thay cả 2 khối trong 2 use-case bằng `const updateInput = toPromotionUpdateInput(input);`.

- [ ] **Step 3: Docs**
  - `apps/api/CLAUDE.md`: đổi `promotions (vòng đời — PR #5a)` thành `promotions`.
  - Spec `### 8c-bis`: mục 6 → đánh dấu `**[ĐÃ LÀM ở PR #5b]**`; thêm mục 7:

    ```markdown
    7. **`rejectionException` (promotions) chưa hợp nhất vào `DomainError`** — vì
       `confirm-booking.use-case.ts` bắt `err instanceof ConflictException` để nuốt
       `PROMO_LIMIT_REACHED` trên đường late-webhook; đổi một phía sẽ làm tx confirm rollback.
       Hợp nhất ở **PR #14 (booking)** khi sửa được cả hai phía cùng lúc. Giữ đặc điểm
       `message === code`.
    ```

- [ ] **Step 4: Typecheck + lint + build** — cả 3 exit 0.
- [ ] **Step 5: Commit**

```bash
git add apps/api docs
git commit -m "chore(promotions): xoá hằng số chết + gom converter update; docs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Verify + runtime smoke + PR

- [ ] **Step 1: Full suite** — `nvm use`; `pnpm turbo lint typecheck build` + `check:rls`, xanh hết.
- [ ] **Step 2: Hạ tầng + API** — `docker ps`; boot riêng API (`PORT=3001` nếu bận); kill khi xong.
- [ ] **Step 3: Headless smoke** — đây là PR đụng tiền + đồng thời, smoke phải chạm đủ 4 nhánh:

  1. **Đặt booking có promo code** (storefront, customer `customer@studiohub.vn`) → thành công; psql:
     `promo_redemptions` có 1 row `status='reserved'`, `promotions.redeemed_count` +1.
  2. **Confirm booking đó** (đường thanh toán / hoặc đẩy event `booking.confirmed`) → psql: row
     redemption `status='applied'`; `redeemed_count` **không đổi**.
  3. **Redelivery `booking.confirmed`**: psql `UPDATE outbox_events SET processed_at=NULL, attempts=0
     WHERE id='<id>'` → chờ vài chu kỳ relay → psql: vẫn `applied`, `redeemed_count` **không đổi**,
     event được ack (`processed_at` khác NULL) — chứng minh markApplied idempotent.
  4. **Huỷ 100%**: huỷ booking với hoàn 100% → psql: redemption `status='released'`,
     `redeemed_count` **-1**. Rồi **redeliver** `booking.cancelled` → không đổi gì thêm
     (`release` + `releaseUsage` idempotent).
  5. **Huỷ một phần** (refundPercent < 100) trên một booking khác đã applied → psql: redemption
     **vẫn `applied`**, `redeemed_count` **không đổi** (rule §12.5 còn nguyên).
  6. **Cap per-customer**: tạo promo `usageLimitPerCustomer = 1`, đặt booking lần 1 OK, lần 2 cùng
     customer → **409** body đúng
     `{"statusCode":409,"code":"PROMO_LIMIT_REACHED","message":"PROMO_LIMIT_REACHED"}`.
  7. **Cap tổng**: promo `usageLimitTotal = 1` đã dùng hết → đặt booking → **409**
     `PROMO_LIMIT_REACHED` (đường `claimUsage` trả false).
  8. **Event thiếu tenantId**: chèn tay outbox event `booking.expired` với `tenant_id = NULL` → log
     API có `skipping booking.expired: outbox event has no tenantId`, event được ack, không đổi DB.
  9. **Regression `update` sau khi gom converter**: PATCH promo chỉ gửi `name` → field khác giữ
     nguyên; PATCH `{"usageLimitTotal": null}` → NULL. (Cả 2 đường tenant và partner.)

  Nếu một nhánh không dựng được headless, **nói rõ**, đừng bịa.

- [ ] **Step 4: Push + PR**

```bash
git push -u origin refactor/entity-promo-redemption
gh pr create --base refactor/entity-centric --title "refactor(promotions): PR #5b — PromoRedemption + usage claim" --body "$(cat <<'EOF'
PR #5b hoàn tất module promotions (nửa còn lại sau PR #5a) — spec docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md.

- `PromoRedemption` aggregate: đặt tên vòng đời reserved→applied→released, factory `open()` cho reserve
- 2 rule về domain: cap per-customer (`exceedsPerCustomerLimit`) và **chỉ hoàn 100% mới trả usage** (`releasesUsageOnCancel` — trước nằm inline trong đăng ký outbox handler, tức tầng infrastructure)
- Advisory lock `pg_advisory_xact_lock` chuyển từ use-case xuống port (tầng application hết viết SQL thô) — **thứ tự lock → count → compare giữ nguyên**
- Outbox handler: `event.tenantId ?? ''` → validate-and-skip-with-log (normalization spec §4 cho phép, giống PR #3)
- Dọn nợ §8c-bis mục 6: xoá 2 hằng số chết, gom khối chuyển kiểu trùng của 2 use-case update thành `toPromotionUpdateInput`

⚠️ **Cố ý KHÔNG làm**: hợp nhất `rejectionException` vào `DomainError`. `confirm-booking.use-case.ts:80` bắt `err instanceof ConflictException` để nuốt `PROMO_LIMIT_REACHED` trên đường late-webhook; đổi một phía sẽ làm tx confirm rollback (booking đã trả tiền không confirm được). Để dành PR #14 booking, đã ghi spec §8c-bis mục 7.

Giữ nguyên tuyệt đối: 4 câu SQL guard (claimUsage/releaseUsage/markApplied/release), unique `promo_redemptions(booking_id)`, chữ ký `Prepare`/`Reserve` (booking gọi trong tx của nó), `usageLimitPerCustomer: null` của đường late-webhook, `PromotionSnapshot`, và tính không-throw của 4 outbox handler.

Verify: pnpm turbo lint typecheck build + check:rls xanh; smoke 9 nhánh gồm redelivery confirm/cancel (idempotent), huỷ một phần giữ `applied`, cap per-customer + cap tổng ra 409 đúng body, event thiếu tenantId bị skip.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5:** Báo controller — KHÔNG tự merge.
