# PR #1 Pilot — Reviews aggregate + Wave 0 shared kernel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR pilot của entity-centric refactor: shared kernel `DomainError` + global filter, và module
reviews chuyển sang Review aggregate — wire byte-identical, chỉ đổi write-path.

**Architecture:** Theo spec
[`docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md).
Entity framework-free trong `domain/entities/`; invariant reply-once/ownership và create-eligibility
dời từ repo where-clause + use-case vào aggregate; DB unique vẫn là trọng tài (P2002 → domain error
trong repo). Use-case teo thành load → method → save → emit. Tái tạo từ bản compiled pilot 2026-07-20
còn trong `apps/api/dist/` (source đã mất).

**Tech Stack:** NestJS 11, Prisma (2 pool RLS), zod contracts, pnpm 10.13.1, Node 22.22.0.

## Global Constraints

- **KHÔNG test** (ADR 0005): không tạo `*.spec.*`/`*.test.*`; verify = `typecheck` + `lint` + `build` + chạy app.
- **ADR 0006**: không service class trong application; 1 use-case = 1 file, 1 public `execute()`.
- **Wire byte-identical**: mã lỗi + status + message + envelope `{ statusCode, code, message, details? }` giữ nguyên từng byte; outbox `review.created`/`review.replied` payload + thứ tự emit không đổi.
- **Domain framework-free**: file trong `domain/entities|value-objects|errors` và `shared/domain/domain-error.ts` không import Nest/Prisma/zod.
- **forTenant giữ nguyên**: 1 tx/business-operation, repo nhận `tx`, không nest.
- Node phải là **22.22.0** (`nvm use`); chỉ dùng **pnpm**. Port 5432 có thể bị container `kaigo-postgres-dev` chiếm — nhờ user tự stop, KHÔNG tự đụng container project khác.
- Làm trên branch **`refactor/entity-reviews-pilot`** (checkout từ `refactor/entity-centric`), PR merge vào `refactor/entity-centric` (KHÔNG vào main).
- Read-side đóng băng: 5 list use-case, `isReviewableBooking`, media-upload use-case, mapper, controllers, DTO — không sửa.

**Ghi chú thiết kế (đem ra style-gate sau pilot):** port reviews giữ **hợp nhất** read+write trong một
interface (quyết định pilot 2026-07-20: read-side đã sạch, giảm blast radius) thay vì tách 2 file như
spec §3 khuyến nghị tổng quát — style-gate sẽ quyết các module sau có tách hẳn không.

---

### Task 1: Branch + shared kernel (`DomainError` + `DomainExceptionFilter` + `APP_FILTER`)

**Files:**
- Create: `apps/api/src/shared/domain/domain-error.ts`
- Create: `apps/api/src/shared/domain/domain-exception.filter.ts`
- Modify: `apps/api/src/app.module.ts` (import khối `@nestjs/core` và mảng `providers`)

**Interfaces:**
- Consumes: không có (task đầu).
- Produces: `abstract class DomainError extends Error` với `constructor(code: string, httpStatus: number, message: string, details?: Record<string, unknown>)` và các field readonly `code`/`httpStatus`/`details` — Task 2 extend nó. Filter bắt mọi `DomainError` toàn app.

- [ ] **Step 1: Tạo branch làm việc**

```bash
cd "/Volumes/OVEN Duy/temp/booking-saas"
git checkout refactor/entity-centric && git checkout -b refactor/entity-reviews-pilot
```

- [ ] **Step 2: Viết `apps/api/src/shared/domain/domain-error.ts`**

```ts
/**
 * Base class for framework-free DOMAIN errors thrown by entities / value objects /
 * domain policies. The domain layer must not import Nest, so it cannot throw
 * `HttpException`; it throws a `DomainError` (carrying the HTTP status + app error
 * `code`) which {@link DomainExceptionFilter} translates into the standard error
 * envelope `{ statusCode, code, message, details? }` at the HTTP boundary.
 *
 * This is the ADR-0006-compliant way to keep business rules on entities while
 * preserving the existing wire contract — see
 * `docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md` §2.9.
 */
export abstract class DomainError extends Error {
  constructor(
    /** App-level error code, e.g. `REVIEW_REPLY_NOT_ACCEPTED` (mirrors the guard/pipe codes). */
    readonly code: string,
    /** HTTP status the filter should emit (e.g. 400/403/404/409). */
    readonly httpStatus: number,
    message: string,
    /** Optional structured detail, surfaced as `details` in the envelope. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
```

- [ ] **Step 3: Viết `apps/api/src/shared/domain/domain-exception.filter.ts`**

```ts
import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from './domain-error';

/**
 * Translates a framework-free {@link DomainError} (thrown by an entity / value
 * object / domain policy) into the app's standard error envelope
 * `{ statusCode, code, message, details? }` — the same shape the zod pipe and the
 * permissions guard already emit. Registered globally via `APP_FILTER` so domain
 * code never has to import Nest just to shape an HTTP response.
 *
 * Only catches `DomainError`; every other exception (NestJS `HttpException`,
 * Prisma errors, etc.) is left to Nest's default handling, unchanged.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(error.httpStatus).json({
      statusCode: error.httpStatus,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }
}
```

- [ ] **Step 4: Wire `APP_FILTER` trong `apps/api/src/app.module.ts`**

Sửa dòng import `@nestjs/core` (hiện là `import { APP_GUARD, APP_PIPE } from '@nestjs/core';`):

```ts
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
```

Thêm import sau dòng `import { ZodDtoValidationPipe } ...`:

```ts
import { DomainExceptionFilter } from './shared/domain/domain-exception.filter';
```

Trong mảng `providers` (hiện có APP_GUARD + APP_PIPE), thêm phần tử cuối:

```ts
    // Translates framework-free DomainError (thrown by entities/VOs) into the
    // standard error envelope; all other exceptions keep Nest's default handling.
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter=@booking/api typecheck
```
Expected: exit 0, không lỗi.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/shared/domain apps/api/src/app.module.ts
git commit -m "feat(api): shared domain kernel — DomainError + global DomainExceptionFilter

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Review domain — errors + value objects + aggregate

**Files:**
- Create: `apps/api/src/modules/reviews/domain/errors/review-errors.ts`
- Create: `apps/api/src/modules/reviews/domain/value-objects/rating.ts`
- Create: `apps/api/src/modules/reviews/domain/value-objects/review-content.ts`
- Create: `apps/api/src/modules/reviews/domain/entities/review.entity.ts`

**Interfaces:**
- Consumes: `DomainError` (Task 1).
- Produces (Task 3 dùng đúng các tên này):
  - Errors: `ReviewValidationError(field, message)`, `ReviewBookingNotEligible()`, `ReviewAlreadyExists()`, `ReviewReplyNotAccepted()`, `ReviewReplyAlreadyExists()`, `ReviewTenantNotFound()`.
  - VOs: `Rating.of(n: number): Rating` (`.value: number`), `ReviewContent.of(raw: string): ReviewContent` (`.value: string`).
  - Entity: interfaces `EligibleBooking { id; listingId; groupId: string | null; partnerId }`, `NewReview { bookingId; listingId; groupId: string | null; partnerId; customerId; rating: number; content: string }`, `PendingReply { partnerId; authorUserId; content: string }`, `ReviewState { id; tenantId; bookingId; partnerId; reply: { partnerId: string } | null }`; class `Review` với `static rehydrate(state: ReviewState): Review`, `static open(input): NewReview`, `get id()`, `get bookingId()`, `addReply(partnerId, authorUserId, content: ReviewContent): void`, `reply(): PendingReply | null`.

- [ ] **Step 1: Viết `apps/api/src/modules/reviews/domain/errors/review-errors.ts`**

```ts
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the Review aggregate. Codes + HTTP statuses are kept
 * byte-identical to the pre-refactor controller/use-case behaviour so the wire
 * contract is unchanged (spec: byte-identical wire).
 */

/** A value object rejected its input (rating out of range, content length). Defensive:
 *  the zod DTO already validates these, so this normally never reaches the wire. */
export class ReviewValidationError extends DomainError {
  constructor(field: string, message: string) {
    super('VALIDATION_ERROR', 400, message, { fieldErrors: { [field]: [message] } });
  }
}

/** The booking is not an owned, completed, not-yet-reviewed booking (§16 eligibility). */
export class ReviewBookingNotEligible extends DomainError {
  constructor() {
    super(
      'REVIEW_BOOKING_NOT_ELIGIBLE',
      409,
      'Only an owned completed booking without a review can be reviewed',
    );
  }
}

/** Lost the race on the `(booking_id)` unique index — a review already exists. */
export class ReviewAlreadyExists extends DomainError {
  constructor() {
    super('REVIEW_ALREADY_EXISTS', 409, 'This booking already has a review');
  }
}

/** Reply rejected: review missing, already replied to, or owned by another partner (§16). */
export class ReviewReplyNotAccepted extends DomainError {
  constructor() {
    super(
      'REVIEW_REPLY_NOT_ACCEPTED',
      409,
      'Review is missing, already replied to, or belongs to another partner',
    );
  }
}

/** Lost the race on the `(review_id)` unique index — a reply already exists. */
export class ReviewReplyAlreadyExists extends DomainError {
  constructor() {
    super('REVIEW_REPLY_ALREADY_EXISTS', 409, 'This review already has a reply');
  }
}

/** The storefront Host did not resolve to a live tenant. */
export class ReviewTenantNotFound extends DomainError {
  constructor() {
    super('TENANT_NOT_FOUND', 404, 'Tenant not found');
  }
}
```

- [ ] **Step 2: Viết `apps/api/src/modules/reviews/domain/value-objects/rating.ts`**

```ts
import { ReviewValidationError } from '../errors/review-errors';

/**
 * A review star rating: an integer 1–5. Value object — construction is the only
 * validation point, so an invalid rating can never exist as a `Rating`.
 */
export class Rating {
  private constructor(readonly value: number) {}

  static of(n: number): Rating {
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      throw new ReviewValidationError('rating', 'Rating must be an integer between 1 and 5');
    }
    return new Rating(n);
  }
}
```

- [ ] **Step 3: Viết `apps/api/src/modules/reviews/domain/value-objects/review-content.ts`**

```ts
import { ReviewValidationError } from '../errors/review-errors';

/**
 * Review or reply body: trimmed, 10–2000 characters. Value object — the trim +
 * length invariant lives here, mirroring the `.trim().min(10).max(2000)` bounds in
 * `@booking/contracts` (`review.ts`), so it never alters what zod already accepted.
 */
export class ReviewContent {
  private constructor(readonly value: string) {}

  static of(raw: string): ReviewContent {
    const value = raw.trim();
    if (value.length < 10 || value.length > 2000) {
      throw new ReviewValidationError('content', 'Content must be between 10 and 2000 characters');
    }
    return new ReviewContent(value);
  }
}
```

- [ ] **Step 4: Viết `apps/api/src/modules/reviews/domain/entities/review.entity.ts`**

```ts
import { Rating } from '../value-objects/rating';
import { ReviewContent } from '../value-objects/review-content';
import { ReviewReplyNotAccepted } from '../errors/review-errors';

/**
 * Review aggregate root (§16). Owns the two write invariants that used to live in
 * Prisma where-clauses / use-cases:
 *   - create eligibility (owned + completed + not-yet-reviewed booking) — resolved
 *     by the repository's `findEligibleBooking`, then assembled via {@link Review.open};
 *   - reply-once + partner-ownership — enforced by {@link Review.addReply}.
 *
 * Framework-free: no Nest, no Prisma. Money/date serialisation and the fat
 * read-projection (`ReviewRecord`) stay in the mapper / read side.
 */

/** Booking facts the create path needs, resolved by the repo eligibility read. */
export interface EligibleBooking {
  id: string;
  listingId: string;
  groupId: string | null;
  partnerId: string;
}

/** Validated insert payload for a brand-new review (id/timestamps assigned by the DB). */
export interface NewReview {
  bookingId: string;
  listingId: string;
  groupId: string | null;
  partnerId: string;
  customerId: string;
  rating: number;
  content: string;
}

/** The reply to append, before the DB assigns its id/createdAt. */
export interface PendingReply {
  partnerId: string;
  authorUserId: string;
  content: string;
}

/** The persisted write-state of a review needed to enforce the reply invariant. */
export interface ReviewState {
  id: string;
  tenantId: string;
  bookingId: string;
  partnerId: string;
  /** Presence (non-null) means a reply already exists. */
  reply: { partnerId: string } | null;
}

export class Review {
  private pendingReply: PendingReply | null;

  private constructor(
    private readonly state: ReviewState,
    pendingReply: PendingReply | null,
  ) {
    this.pendingReply = pendingReply;
  }

  /** Rehydrate an existing review from persistence (the reply path). */
  static rehydrate(state: ReviewState): Review {
    return new Review(state, null);
  }

  /**
   * Assemble a validated new review from an eligible booking (the create path).
   * Runs the Rating/ReviewContent invariants; the DB assigns id/timestamps on insert.
   */
  static open(input: {
    booking: EligibleBooking;
    customerId: string;
    rating: number;
    content: string;
  }): NewReview {
    const rating = Rating.of(input.rating);
    const content = ReviewContent.of(input.content);
    return {
      bookingId: input.booking.id,
      listingId: input.booking.listingId,
      groupId: input.booking.groupId,
      partnerId: input.booking.partnerId,
      customerId: input.customerId,
      rating: rating.value,
      content: content.value,
    };
  }

  get id(): string {
    return this.state.id;
  }

  get bookingId(): string {
    return this.state.bookingId;
  }

  /**
   * §16 reply invariant (was `where: { id, partnerId, reply: null }`): a review may
   * be replied to exactly once, and only by the partner that owns it. Both failures
   * collapse to {@link ReviewReplyNotAccepted} to preserve the existing wire code.
   */
  addReply(partnerId: string, authorUserId: string, content: ReviewContent): void {
    if (this.state.reply !== null || this.pendingReply !== null) {
      throw new ReviewReplyNotAccepted();
    }
    if (partnerId !== this.state.partnerId) {
      throw new ReviewReplyNotAccepted();
    }
    this.pendingReply = { partnerId, authorUserId, content: content.value };
  }

  /** The reply queued by {@link addReply}, for the repository to persist (null if none). */
  reply(): PendingReply | null {
    return this.pendingReply;
  }
}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter=@booking/api typecheck
```
Expected: exit 0 (file mới chưa ai import — chỉ cần compile sạch).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/reviews/domain
git commit -m "feat(reviews): Review aggregate + Rating/ReviewContent VOs + domain errors

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Write-path swap — port + repository + 2 write use-cases

**Files:**
- Modify: `apps/api/src/modules/reviews/domain/ports/review-repository.port.ts:83-107` (interface `IReviewRepository`)
- Modify: `apps/api/src/modules/reviews/infrastructure/repositories/prisma-review.repository.ts:176-242` (3 method write cũ)
- Modify: `apps/api/src/modules/reviews/application/use-cases/create-review.use-case.ts` (viết lại)
- Modify: `apps/api/src/modules/reviews/application/use-cases/reply-review.use-case.ts` (viết lại)

**Interfaces:**
- Consumes: mọi tên từ Task 2 đúng như khai báo ở đó.
- Produces: `IReviewRepository` mới — `findEligibleBooking(tx, customerId, bookingId): Promise<EligibleBooking | null>`; `insert(tx, tenantId, review: NewReview, media: ReviewMediaRecord[]): Promise<ReviewRecord>`; `loadForReply(tx, reviewId): Promise<ReviewState | null>`; `saveReply(tx, tenantId, review: Review): Promise<ReviewRecord>`. Giữ nguyên: `isReviewableBooking` (media-upload use-case đang dùng) + 4 list method. **Không đổi** token `REVIEW_REPOSITORY`, record types, DTO, controller, mapper.

- [ ] **Step 1: Sửa interface trong `review-repository.port.ts`**

Thêm import (sau import `PrismaTx`):

```ts
import type {
  EligibleBooking,
  NewReview,
  Review,
  ReviewState,
} from '../entities/review.entity';
```

Thay 2 method `create` (dòng 84-89) và `reply` (dòng 91-98) trong `IReviewRepository` — giữ nguyên
`isReviewableBooking` và 4 list method — bằng:

```ts
  /** §16 eligibility read: owned + completed + not-yet-reviewed booking (null = not eligible). */
  findEligibleBooking(
    tx: PrismaTx,
    customerId: string,
    bookingId: string,
  ): Promise<EligibleBooking | null>;
  /** Insert a validated new review; the `(booking_id)` unique race → `ReviewAlreadyExists`. */
  insert(
    tx: PrismaTx,
    tenantId: string,
    review: NewReview,
    media: ReviewMediaRecord[],
  ): Promise<ReviewRecord>;
  /** Narrow write-state for the reply path (null = review not found). */
  loadForReply(tx: PrismaTx, reviewId: string): Promise<ReviewState | null>;
  /** Persist the reply queued on the aggregate; `(review_id)` unique race → `ReviewReplyAlreadyExists`. */
  saveReply(tx: PrismaTx, tenantId: string, review: Review): Promise<ReviewRecord>;
```

- [ ] **Step 2: Sửa `prisma-review.repository.ts`**

Thêm import (sau block import từ port):

```ts
import type {
  EligibleBooking,
  NewReview,
  Review,
  ReviewState,
} from '../../domain/entities/review.entity';
import {
  ReviewAlreadyExists,
  ReviewReplyAlreadyExists,
  ReviewReplyNotAccepted,
} from '../../domain/errors/review-errors';
```

Thay nguyên 3 method `isReviewableBooking`/`create`/`reply` (dòng 177-242) bằng (giữ
`isReviewableBooking` nguyên văn, thay `create`→`findEligibleBooking`+`insert`,
`reply`→`loadForReply`+`saveReply`):

```ts
  async isReviewableBooking(
    tx: PrismaTx,
    customerId: string,
    bookingId: string,
  ): Promise<boolean> {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, customerId, status: 'completed', review: null },
      select: { id: true },
    });
    return Boolean(booking);
  }

  async findEligibleBooking(
    tx: PrismaTx,
    customerId: string,
    bookingId: string,
  ): Promise<EligibleBooking | null> {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, customerId, status: 'completed', review: null },
      select: {
        id: true,
        listingId: true,
        partnerId: true,
        listing: { select: { groupId: true } },
      },
    });
    if (!booking) return null;
    return {
      id: booking.id,
      listingId: booking.listingId,
      groupId: booking.listing.groupId,
      partnerId: booking.partnerId,
    };
  }

  async insert(
    tx: PrismaTx,
    tenantId: string,
    review: NewReview,
    media: ReviewRecord['media'],
  ): Promise<ReviewRecord> {
    try {
      const row = await tx.review.create({
        data: {
          tenantId,
          bookingId: review.bookingId,
          listingId: review.listingId,
          groupId: review.groupId,
          partnerId: review.partnerId,
          customerId: review.customerId,
          rating: review.rating,
          content: review.content,
          media: media as unknown as Prisma.InputJsonValue,
        },
        include: REVIEW_INCLUDE,
      });
      return toReviewRecord(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ReviewAlreadyExists();
      }
      throw error;
    }
  }

  async loadForReply(tx: PrismaTx, reviewId: string): Promise<ReviewState | null> {
    return tx.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        tenantId: true,
        bookingId: true,
        partnerId: true,
        reply: { select: { partnerId: true } },
      },
    });
  }

  async saveReply(tx: PrismaTx, tenantId: string, review: Review): Promise<ReviewRecord> {
    const pending = review.reply();
    // Defensive: the use-case always calls addReply() first; a null here is a programming error.
    if (!pending) throw new ReviewReplyNotAccepted();
    try {
      await tx.reviewReply.create({
        data: {
          tenantId,
          reviewId: review.id,
          partnerId: pending.partnerId,
          authorUserId: pending.authorUserId,
          content: pending.content,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ReviewReplyAlreadyExists();
      }
      throw error;
    }
    const row = await tx.review.findUnique({ where: { id: review.id }, include: REVIEW_INCLUDE });
    // Unreachable: the review row exists in this tx (we just appended its reply).
    if (!row) throw new ReviewReplyNotAccepted();
    return toReviewRecord(row);
  }
```

- [ ] **Step 3: Viết lại `create-review.use-case.ts`**

Toàn bộ file mới:

```ts
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { CreateReviewInput } from '@booking/contracts';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { STORAGE_PORT, type StoragePort } from '../../../../shared/storage/storage.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { Review } from '../../domain/entities/review.entity';
import { ReviewBookingNotEligible, ReviewTenantNotFound } from '../../domain/errors/review-errors';
import {
  REVIEW_REPOSITORY,
  type IReviewRepository,
  type ReviewRecord,
} from '../../domain/ports/review-repository.port';
import {
  REVIEW_TENANT_READER,
  type IReviewTenantReader,
} from '../../domain/ports/review-tenant-reader.port';
import {
  isReviewMediaKeyInScope,
  reviewMediaKindFromKey,
  reviewMediaPrefix,
} from '../../domain/review-media';

@Injectable()
export class CreateReviewUseCase {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: IReviewRepository,
    @Inject(REVIEW_TENANT_READER) private readonly tenants: IReviewTenantReader,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(host: string, customerId: string, input: CreateReviewInput): Promise<ReviewRecord> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId) throw new ReviewTenantNotFound();
    const prefix = reviewMediaPrefix(tenantId, customerId, input.bookingId);
    const uniqueKeys = new Set(input.media.map((item) => item.key));
    if (uniqueKeys.size !== input.media.length) {
      throw invalidReviewMedia('Duplicate review media keys are not allowed');
    }
    const media = input.media.map(({ key }) => {
      const kind = reviewMediaKindFromKey(key);
      if (!kind || !isReviewMediaKeyInScope(key, prefix)) {
        throw invalidReviewMedia('Review media key is invalid or outside the booking scope');
      }
      return { kind, key, url: this.storage.publicUrlForKey(key) };
    });
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await this.reviews.findEligibleBooking(tx, customerId, input.bookingId);
      if (!booking) throw new ReviewBookingNotEligible();
      const review = await this.reviews.insert(
        tx,
        tenantId,
        Review.open({ booking, customerId, rating: input.rating, content: input.content }),
        media,
      );
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'review.created',
        payload: { reviewId: review.id, listingId: review.listingId, groupId: review.groupId },
      });
      return review;
    });
  }
}

function invalidReviewMedia(message: string): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_REVIEW_MEDIA',
    message,
  });
}
```

(Media-scope validation ở lại use-case: đó là input-scope check của HTTP layer với mã riêng
`INVALID_REVIEW_MEDIA`, không phải invariant của aggregate. P2002 giờ do repo dịch thành
`ReviewAlreadyExists` bên trong tx — wire không đổi.)

- [ ] **Step 4: Viết lại `reply-review.use-case.ts`**

Toàn bộ file mới:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { ReplyReviewInput } from '@booking/contracts';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { Review } from '../../domain/entities/review.entity';
import { ReviewReplyNotAccepted } from '../../domain/errors/review-errors';
import { ReviewContent } from '../../domain/value-objects/review-content';
import {
  REVIEW_REPOSITORY,
  type IReviewRepository,
  type ReviewRecord,
} from '../../domain/ports/review-repository.port';

@Injectable()
export class ReplyReviewUseCase {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: IReviewRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    reviewId: string,
    partnerId: string,
    authorUserId: string,
    input: ReplyReviewInput,
  ): Promise<ReviewRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const state = await this.reviews.loadForReply(tx, reviewId);
      if (!state) throw new ReviewReplyNotAccepted();
      const review = Review.rehydrate(state);
      review.addReply(partnerId, authorUserId, ReviewContent.of(input.content));
      const record = await this.reviews.saveReply(tx, tenantId, review);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'review.replied',
        payload: { reviewId: record.id, bookingId: record.bookingId },
      });
      return record;
    });
  }
}
```

- [ ] **Step 5: Typecheck + lint + build**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint && pnpm --filter=@booking/api build
```
Expected: cả 3 exit 0. Nếu lint kêu unused import (`ConflictException`, `NotFoundException`,
`Prisma` trong 2 use-case cũ) — đã bỏ trong bản viết lại ở trên, kiểm tra lại đúng nội dung file.

- [ ] **Step 6: Đối chiếu wire (đọc lại, không chạy)**

So từng mã lỗi giữa bản cũ (`git diff HEAD -- apps/api/src/modules/reviews` — old content đang ở HEAD
vì chưa commit) và code mới:

| Path | Cũ | Mới |
|---|---|---|
| Tenant không resolve | 404 `TENANT_NOT_FOUND` (NotFoundException) | 404 `TENANT_NOT_FOUND` (ReviewTenantNotFound→filter) |
| Booking không đủ điều kiện | 409 `REVIEW_BOOKING_NOT_ELIGIBLE` | 409 (ReviewBookingNotEligible) |
| Race unique booking_id | 409 `REVIEW_ALREADY_EXISTS` | 409 (repo P2002→ReviewAlreadyExists) |
| Reply sai (missing/đã reply/khác partner) | 409 `REVIEW_REPLY_NOT_ACCEPTED` | 409 (load-null / addReply → ReviewReplyNotAccepted) |
| Race unique review_id | 409 `REVIEW_REPLY_ALREADY_EXISTS` | 409 (repo P2002→ReviewReplyAlreadyExists) |
| Media sai | 400 `INVALID_REVIEW_MEDIA` | 400 (không đổi, vẫn BadRequestException) |

Message string phải giống từng byte (so với Task 2 Step 1). Outbox: `review.created` payload
`{ reviewId, listingId, groupId }`, `review.replied` payload `{ reviewId, bookingId }` — không đổi.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/reviews
git commit -m "refactor(reviews): write-path qua Review aggregate — port findEligibleBooking/insert/loadForReply/saveReply

Invariant reply-once/ownership + create-eligibility dời vào entity; repo dịch
P2002 thành domain error; wire byte-identical. Read side không đổi.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Cập nhật docs theo spec §7

**Files:**
- Modify: `apps/api/CLAUDE.md` (mục Bootstrap, errors, config — câu "There is no enableCors and no global exception filter")
- Modify: `docs/conventions.md` (mục "Backend (hexagonal)")

**Interfaces:** không có code.

- [ ] **Step 1: Sửa `apps/api/CLAUDE.md`**

Tìm câu (mục "Bootstrap, errors, config"):

> **There is no `enableCors` and no global exception filter** — domain use-cases
> throw NestJS `HttpException`s, and the error envelope is …

Thay bằng:

```markdown
**There is no `enableCors`.** There is ONE global exception filter:
`DomainExceptionFilter` (`src/shared/domain/domain-exception.filter.ts`, wired via `APP_FILTER`) —
it only catches framework-free `DomainError`s thrown by entities/VOs and emits the standard envelope
`{ statusCode, code, message, details? }`; everything else keeps Nest's default handling. Application
code may still throw NestJS `HttpException`s directly. Never leak Prisma errors.
```

Và trong mục "The request flow", sau đoạn Module shape, thêm:

```markdown
Modules refactored to the entity style (see
`docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md`) keep their business
invariants on framework-free aggregates in `domain/entities/` (`static rehydrate(state)` +
`static create/open(...)`, narrow write-state, VOs in `domain/value-objects/`, typed
`DomainError`s in `domain/errors/`); use-cases orchestrate load → method → save → emit. Refactored
so far: **reviews**.
```

- [ ] **Step 2: Sửa `docs/conventions.md`**

Trong mục "Backend (hexagonal)", sau câu về ADR 0006, thêm:

```markdown
Modules being migrated to the entity-centric style additionally keep write-path invariants on
framework-free aggregates in `domain/entities/` with typed `DomainError`s (translated to the wire
envelope by the global `DomainExceptionFilter`) — rules, aggregate map and per-module order in
[the refactor spec](./superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md).
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/CLAUDE.md docs/conventions.md
git commit -m "docs(api): ghi nhận global DomainExceptionFilter + style entity cho module đã refactor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Verify toàn bộ + runtime smoke

**Files:** không sửa file (chỉ chạy; nếu lòi lỗi thì fix + amend vào commit Task tương ứng).

- [ ] **Step 1: Full suite**

```bash
cd "/Volumes/OVEN Duy/temp/booking-saas" && nvm use && pnpm turbo lint typecheck build
```
Expected: tất cả task xanh. (Node phải 22.22.0 — RR8 từ chối Node 20.)

- [ ] **Step 2: Hạ tầng + app**

```bash
docker compose up -d          # nếu 5432 bận: báo user tự stop kaigo-postgres-dev, KHÔNG tự stop
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api seed
pnpm --filter=@booking/api storage:init
pnpm dev                      # api :3000, storefront :5173, dashboard :5174
```
Expected: log api có `Nest application successfully started`.

- [ ] **Step 3: Smoke write-path reviews (bấm tay)**

1. Storefront `localhost:5173`, đăng nhập `customer@studiohub.vn` / `demo-password` → tài khoản →
   lịch sử booking → chọn 1 booking **completed** chưa review → gửi đánh giá (rating + nội dung
   ≥10 ký tự). Expected: thành công, review hiện trên listing.
2. Gửi đánh giá **lần 2 cùng booking** (mở lại dialog nếu UI cho phép, hoặc gọi lại từ tab
   Network → Copy as fetch → chạy lại trong console). Expected: response **409**, body đúng
   `{ "statusCode": 409, "code": "REVIEW_BOOKING_NOT_ELIGIBLE", "message": "Only an owned completed booking without a review can be reviewed" }`.
3. Dashboard `localhost:5174`, đăng nhập partner `giang@giangstudio.vn` / `demo-password` →
   Đánh giá → trả lời review vừa tạo. Expected: thành công.
4. Trả lời **lần 2** cùng review (replay request như bước 2). Expected: **409**
   `REVIEW_REPLY_NOT_ACCEPTED` với đúng message.
5. Kiểm tra Mailpit `localhost:8025` / log outbox relay: event `review.created` + `review.replied`
   được relay không lỗi (notification module tiêu thụ chúng).

- [ ] **Step 4: Chốt PR**

```bash
git push -u origin refactor/entity-reviews-pilot
gh pr create --base refactor/entity-centric --title "refactor(reviews): PR #1 pilot — Review aggregate + shared DomainError kernel" --body "$(cat <<'EOF'
PR pilot của entity-centric refactor theo docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md.

- Wave 0: shared/domain DomainError + global DomainExceptionFilter (APP_FILTER)
- Review aggregate + Rating/ReviewContent VO + typed domain errors
- Port write-side: create/reply → findEligibleBooking/insert/loadForReply/saveReply (token, record types, read side, isReviewableBooking giữ nguyên)
- 2 write use-case teo thành load → method → save → emit

Surface freeze: mã lỗi + message byte-identical (bảng đối chiếu trong plan Task 3 Step 6);
outbox review.created/review.replied payload + thứ tự không đổi; controllers/DTO/mapper/read side untouched.
Outbox handler: module này không consume event nào — không đụng.
Verify: pnpm turbo lint typecheck build xanh + smoke create/duplicate/reply/duplicate-reply chạy tay (plan Task 5).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Style-gate với owner (BẮT BUỘC theo spec §6)**

Dừng tại đây. Báo owner review PR pilot + chốt 2 câu hỏi style trước khi làm PR #2:
1. Port hợp nhất (như pilot) hay tách write/read port từ PR #2 trở đi?
2. Style entity như pilot đã đúng ý chưa (rehydrate/open, VO, DomainError)?

Hết plan — không tự làm tiếp PR #2.
