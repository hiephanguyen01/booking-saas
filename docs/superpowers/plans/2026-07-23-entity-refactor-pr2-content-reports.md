# PR #2 — ContentReport aggregate (content-reports) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Module content-reports chuyển write-path sang `ContentReport` aggregate — máy trạng thái
moderation đầu tiên của refactor — wire byte-identical, theo spec §3 bản đã ratify style-gate.

**Architecture:** Theo spec
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
(§3 + style-gate 2026-07-23) và khảo sát
[`entity-centric-survey.md`](../../refactor/entity-centric-survey.md) mục content-reports. Rule
"terminal = resolved|dismissed → handledAt" và "active = open|reviewing" dời từ repo vào entity;
duplicate-blocking giữ nguyên skipDuplicates + partial-unique + refetch trong repo (luật CAS). Port
đang fat (list/findById fat record trộn write) → **tách reader port** theo rule tách-khi-fat.

**Tech Stack:** NestJS 11, Prisma (RLS), zod contracts, pnpm 10.13.1, Node 22.22.0.

## Global Constraints

- **KHÔNG test** (ADR 0005); verify = `typecheck` + `lint` + `build` + chạy app.
- **ADR 0006**: không service class; 1 use-case = 1 file.
- **Wire byte-identical**: mã lỗi + status + message + envelope giữ từng byte; audit payload
  `content_report.status_changed` giữ nguyên shape `{ fromStatus, toStatus, resolutionNote, targetType, targetId }`
  (chú ý: `resolutionNote` trong audit dùng `?? null`, trong DB write dùng `|| null` — GIỮ NGUYÊN
  sự lệch này); response `{ report, duplicate }` giữ nguyên.
- **KNOWN GAP GIỮ NGUYÊN (spec §8a)**: status transition **any→any vẫn được phép** (kể cả
  resolved→open) — KHÔNG thêm transition-legality. Entity ghi doc comment tham chiếu §8a.
- **CAS/duplicate giữ nguyên**: skipDuplicates + DB partial unique index + refetch trong repo —
  KHÔNG thay bằng create() thường sau check in-memory.
- **Clock giữ nguồn hiện tại**: `handledAt` đang dùng app-clock `new Date()` (repo) — use-case cấp
  `new Date()` cho entity, KHÔNG đổi sang DB clock (ghi follow-up).
- **Cross-module ACL reads giữ ở port**: `findPublishedTarget` (bảng listing/listing_groups),
  `getReporterName` (users) — KHÔNG kéo vào aggregate.
- Domain files framework-free (contracts chỉ import type). Entity: `_pendingModeration` field +
  `pendingModeration()` accessor + defensive throw = `Error` thường (style-gate refinements).
- Read-side đóng băng về hành vi: list/findById logic, controllers, DTO, mapper logic,
  tenant-reader (admin pool) — không đổi hành vi (chỉ đổi import khi type dời file).
- Node **22.22.0** (`nvm use`), chỉ **pnpm**. Port 5432/3000 có thể bị project khác chiếm
  (`kaigo-postgres-dev` / `cf-connect-be`) — không đụng container/process project khác; API smoke
  dùng PORT=3001 nếu cần.
- Branch **`refactor/entity-content-reports`** (checkout từ `refactor/entity-centric` đã có pilot),
  PR merge vào `refactor/entity-centric`.

---

### Task 1: Branch + domain — errors + ContentReport aggregate

**Files:**
- Create: `apps/api/src/modules/content-reports/domain/errors/content-report-errors.ts`
- Create: `apps/api/src/modules/content-reports/domain/entities/content-report.entity.ts`

**Interfaces:**
- Consumes: `DomainError` (shared kernel, có sẵn từ PR #1).
- Produces (Task 2 dùng đúng các tên này): errors `ContentReportValidationError(field, message)`,
  `ReportTargetNotFound()`, `ReporterNotFound()`, `ContentReportNotFound()`; entity exports
  `ACTIVE_CONTENT_REPORT_STATUSES`, `isTerminalContentReportStatus(status)`, interfaces
  `ReportableTarget`, `NewContentReport`, `PendingModeration`, `ContentReportState`; class
  `ContentReport` với `static rehydrate(state)`, `static open(input): NewContentReport`,
  getters `id`/`status`/`target`/`targetId`, `moderate(input): void`,
  `pendingModeration(): PendingModeration | null`.

- [ ] **Step 1: Tạo branch**

```bash
cd "/Volumes/OVEN Duy/temp/booking-saas"
git checkout refactor/entity-centric && git pull origin refactor/entity-centric
git checkout -b refactor/entity-content-reports
```

- [ ] **Step 2: Viết `content-report-errors.ts`**

```ts
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the ContentReport aggregate. Codes + statuses + messages are
 * byte-identical to the pre-refactor use-case behaviour (wire frozen).
 */

/** Defensive mirror of the contracts superRefines — the zod DTO pipe is the real boundary. */
export class ContentReportValidationError extends DomainError {
  constructor(field: string, message: string) {
    super('VALIDATION_ERROR', 400, message, { fieldErrors: { [field]: [message] } });
  }
}

/** The reported listing/group is not published under an approved partner. */
export class ReportTargetNotFound extends DomainError {
  constructor() {
    super('REPORT_TARGET_NOT_FOUND', 404, 'Published listing or group not found');
  }
}

/** The reporting user no longer exists. */
export class ReporterNotFound extends DomainError {
  constructor() {
    super('REPORTER_NOT_FOUND', 404, 'Reporter not found');
  }
}

/** No content report with this id in the tenant. */
export class ContentReportNotFound extends DomainError {
  constructor() {
    super('CONTENT_REPORT_NOT_FOUND', 404, 'Content report not found');
  }
}
```

- [ ] **Step 3: Viết `content-report.entity.ts`**

```ts
import type {
  ContentReportReason,
  ContentReportStatus,
  ContentReportTarget,
} from '@booking/contracts';
import { ContentReportValidationError } from '../errors/content-report-errors';

/**
 * ContentReport aggregate root — a customer's moderation report against a published
 * listing/group, moderated by the tenant (open → reviewing → resolved|dismissed).
 *
 * Owns the write rules that used to live in the repository:
 *   - the "active report" status set (duplicate blocker) — {@link ACTIVE_CONTENT_REPORT_STATUSES},
 *     mirrored by the DB partial unique index (which stays the concurrency arbiter);
 *   - terminal-status derivation: handledAt is set iff the new status is terminal
 *     — {@link ContentReport.moderate}.
 *
 * KNOWN GAP (spec §8a, preserved on purpose): status transitions have NO legality
 * graph — any→any (including resolved→open) is allowed, exactly as before the
 * refactor. Tightening it is a behavior change that needs its own approval.
 *
 * Framework-free: no Nest, no Prisma, no zod (contracts imports are type-only).
 */

/** The "active" statuses that block a duplicate report; mirrors the DB partial unique index. */
export const ACTIVE_CONTENT_REPORT_STATUSES: readonly ContentReportStatus[] = [
  'open',
  'reviewing',
];

export function isTerminalContentReportStatus(status: ContentReportStatus): boolean {
  return status === 'resolved' || status === 'dismissed';
}

/** Target facts the create path needs, resolved by the repo's cross-module ACL read. */
export interface ReportableTarget {
  target: ContentReportTarget;
  id: string;
  title: string;
  slug: string;
  partnerId: string;
  partnerName: string;
}

/** Validated insert payload for a new report (id/status/timestamps assigned by the DB). */
export interface NewContentReport {
  reporterUserId: string;
  reporterName: string;
  target: ContentReportTarget;
  targetId: string;
  targetTitle: string;
  targetSlug: string;
  partnerId: string;
  partnerName: string;
  reason: ContentReportReason;
  details: string | null;
}

/** The moderation write queued by {@link ContentReport.moderate}. */
export interface PendingModeration {
  status: ContentReportStatus;
  resolutionNote: string | null;
  handledByUserId: string;
  handledAt: Date | null;
}

/** The persisted write-state the moderation path needs (audit pre-image included). */
export interface ContentReportState {
  id: string;
  status: ContentReportStatus;
  target: ContentReportTarget;
  targetId: string;
}

export class ContentReport {
  private _pendingModeration: PendingModeration | null;

  private constructor(
    private readonly state: ContentReportState,
    pendingModeration: PendingModeration | null,
  ) {
    this._pendingModeration = pendingModeration;
  }

  /** Rehydrate an existing report from persistence (the moderation path). */
  static rehydrate(state: ContentReportState): ContentReport {
    return new ContentReport(state, null);
  }

  /**
   * Assemble a validated new report against a reportable target (the create path).
   * Mirrors the contracts superRefine (reason 'other' needs details ≥ 20 chars) as
   * defensive depth — the zod DTO pipe is the real boundary.
   */
  static open(input: {
    target: ReportableTarget;
    reporterUserId: string;
    reporterName: string;
    reason: ContentReportReason;
    details: string | null;
  }): NewContentReport {
    if (input.reason === 'other' && (!input.details || input.details.length < 20)) {
      throw new ContentReportValidationError('details', 'Vui lòng mô tả ít nhất 20 ký tự');
    }
    return {
      reporterUserId: input.reporterUserId,
      reporterName: input.reporterName,
      target: input.target.target,
      targetId: input.target.id,
      targetTitle: input.target.title,
      targetSlug: input.target.slug,
      partnerId: input.target.partnerId,
      partnerName: input.target.partnerName,
      reason: input.reason,
      details: input.details,
    };
  }

  get id(): string {
    return this.state.id;
  }

  /** Pre-moderation (persisted) status — the audit trail's from-status. */
  get status(): ContentReportStatus {
    return this.state.status;
  }

  get target(): ContentReportTarget {
    return this.state.target;
  }

  get targetId(): string {
    return this.state.targetId;
  }

  /**
   * Queue a moderation write. Owns the rule that used to be the repository's
   * `terminal ? new Date() : null`: handledAt is set iff the new status is terminal,
   * handledByUserId is stamped on every change. Mirrors the contracts superRefine
   * (terminal status needs a ≥ 10-char resolution note) as defensive depth.
   * NO transition-legality check — see the class doc (spec §8a).
   */
  moderate(input: {
    status: ContentReportStatus;
    resolutionNote: string | null;
    handledByUserId: string;
    now: Date;
  }): void {
    const terminal = isTerminalContentReportStatus(input.status);
    if (terminal && (!input.resolutionNote || input.resolutionNote.length < 10)) {
      throw new ContentReportValidationError(
        'resolutionNote',
        'Ghi chú xử lý cần ít nhất 10 ký tự',
      );
    }
    this._pendingModeration = {
      status: input.status,
      resolutionNote: input.resolutionNote,
      handledByUserId: input.handledByUserId,
      handledAt: terminal ? input.now : null,
    };
  }

  /** The moderation queued by {@link moderate}, for the repository to persist (null if none). */
  pendingModeration(): PendingModeration | null {
    return this._pendingModeration;
  }
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter=@booking/api typecheck
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/content-reports/domain
git commit -m "feat(content-reports): ContentReport aggregate + domain errors

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Write-path swap — tách reader port + repo + 4 use-cases + wiring

**Files:**
- Create: `apps/api/src/modules/content-reports/domain/ports/content-report-reader.port.ts`
- Rewrite: `apps/api/src/modules/content-reports/domain/ports/content-report-repository.port.ts`
- Modify: `apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report.repository.ts`
- Rewrite: `apps/api/src/modules/content-reports/application/use-cases/create-content-report.use-case.ts`
- Rewrite: `apps/api/src/modules/content-reports/application/use-cases/update-content-report.use-case.ts`
- Modify: `apps/api/src/modules/content-reports/application/use-cases/get-content-report.use-case.ts` (đổi sang reader)
- Modify: `apps/api/src/modules/content-reports/application/use-cases/list-content-reports.use-case.ts` (đổi sang reader)
- Modify: `apps/api/src/modules/content-reports/application/content-report.mapper.ts:2` (import record từ reader port)
- Modify: `apps/api/src/modules/content-reports/infrastructure/http/content-reports.module.ts` (bind reader token)

**Interfaces:**
- Consumes: mọi tên từ Task 1.
- Produces: token mới `CONTENT_REPORT_READER` + `IContentReportReader { list, findById }` (giữ nguyên
  `ContentReportRecord`/`ContentReportPage` — chỉ DỜI sang file reader port); write port
  `IContentReportRepository { findPublishedTarget → ReportableTarget | null; getReporterName;
  createOrFindActive(tx, tenantId, report: NewContentReport); loadForModeration(tx, id) →
  ContentReportState | null; saveModeration(tx, report: ContentReport) → ContentReportRecord }`.
  Token `CONTENT_REPORT_REPOSITORY` giữ nguyên. `ReportTargetRecord` bị thay bằng `ReportableTarget`
  (entity) — shape giống hệt.

- [ ] **Step 1: Viết `content-report-reader.port.ts`**

```ts
import type {
  ContentReportStatus,
  ContentReportTarget,
  CreateContentReportInput,
  TenantContentReportsQuery,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const CONTENT_REPORT_READER = Symbol('CONTENT_REPORT_READER');

export interface ContentReportRecord {
  id: string;
  target: ContentReportTarget;
  targetId: string;
  targetTitle: string;
  targetSlug: string;
  partnerId: string | null;
  partnerName: string;
  reporterUserId: string | null;
  reporterName: string;
  reason: CreateContentReportInput['reason'];
  details: string | null;
  status: ContentReportStatus;
  handledByUserId: string | null;
  resolutionNote: string | null;
  handledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentReportPage {
  items: ContentReportRecord[];
  total: number;
  counts: Record<string, number>;
}

export interface IContentReportReader {
  list(tx: PrismaTx, query: TenantContentReportsQuery): Promise<ContentReportPage>;
  findById(tx: PrismaTx, id: string): Promise<ContentReportRecord | null>;
}
```

- [ ] **Step 2: Viết lại write port `content-report-repository.port.ts`** (toàn bộ file)

```ts
import type { ContentReportTarget } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  ContentReport,
  ContentReportState,
  NewContentReport,
  ReportableTarget,
} from '../entities/content-report.entity';
import type { ContentReportRecord } from './content-report-reader.port';

export const CONTENT_REPORT_REPOSITORY = Symbol('CONTENT_REPORT_REPOSITORY');

export interface IContentReportRepository {
  /** Cross-module ACL read: published listing/group under an approved partner (null = not reportable). */
  findPublishedTarget(
    tx: PrismaTx,
    target: ContentReportTarget,
    targetId: string,
  ): Promise<ReportableTarget | null>;
  getReporterName(tx: PrismaTx, userId: string): Promise<string | null>;
  /**
   * Insert a new report or return the reporter's active one for the same target.
   * Duplicate blocking stays concurrency-safe in here: createMany skipDuplicates +
   * the DB partial unique index + refetch (never in-memory check-then-create).
   */
  createOrFindActive(
    tx: PrismaTx,
    tenantId: string,
    report: NewContentReport,
  ): Promise<{ report: ContentReportRecord; duplicate: boolean }>;
  /** Narrow write-state for the moderation path (null = report not found). */
  loadForModeration(tx: PrismaTx, id: string): Promise<ContentReportState | null>;
  /** Persist the moderation queued on the aggregate. */
  saveModeration(tx: PrismaTx, report: ContentReport): Promise<ContentReportRecord>;
}
```

- [ ] **Step 3: Sửa `prisma-content-report.repository.ts`**

Đổi khối import type từ port (giữ `select`/`toRecord`/`Row` nguyên):

```ts
import { Injectable } from '@nestjs/common';
import type {
  ContentReportStatus,
  ContentReportTarget,
  TenantContentReportsQuery,
} from '@booking/contracts';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import {
  ACTIVE_CONTENT_REPORT_STATUSES,
  type ContentReport,
  type ContentReportState,
  type NewContentReport,
  type ReportableTarget,
} from '../../domain/entities/content-report.entity';
import type { IContentReportRepository } from '../../domain/ports/content-report-repository.port';
import type {
  ContentReportPage,
  ContentReportRecord,
  IContentReportReader,
} from '../../domain/ports/content-report-reader.port';
```

Class declaration → `export class PrismaContentReportRepository implements IContentReportRepository, IContentReportReader {`.
`findPublishedTarget`: chỉ đổi return type `Promise<ReportableTarget | null>` (body giữ nguyên).
`getReporterName`, `list`, `findById`: giữ nguyên. Thay `createOrFindActive` và `updateStatus` bằng:

```ts
  async createOrFindActive(
    tx: PrismaTx,
    tenantId: string,
    report: NewContentReport,
  ): Promise<{ report: ContentReportRecord; duplicate: boolean }> {
    const activeWhere = {
      tenantId,
      reporterUserId: report.reporterUserId,
      targetType: report.target,
      targetId: report.targetId,
      status: { in: [...ACTIVE_CONTENT_REPORT_STATUSES] },
    };
    const active = await tx.contentReport.findFirst({ where: activeWhere, select });
    if (active) return { report: toRecord(active), duplicate: true };

    const result = await tx.contentReport.createMany({
      data: [
        {
          tenantId,
          reporterUserId: report.reporterUserId,
          reporterName: report.reporterName,
          partnerId: report.partnerId,
          partnerName: report.partnerName,
          targetType: report.target,
          targetId: report.targetId,
          targetTitle: report.targetTitle,
          targetSlug: report.targetSlug,
          reason: report.reason,
          details: report.details,
        },
      ],
      skipDuplicates: true,
    });
    const created = await tx.contentReport.findFirstOrThrow({ where: activeWhere, select });
    return { report: toRecord(created), duplicate: result.count === 0 };
  }

  async loadForModeration(tx: PrismaTx, id: string): Promise<ContentReportState | null> {
    const row = await tx.contentReport.findUnique({
      where: { id },
      select: { id: true, status: true, targetType: true, targetId: true },
    });
    return row
      ? { id: row.id, status: row.status, target: row.targetType, targetId: row.targetId }
      : null;
  }

  async saveModeration(tx: PrismaTx, report: ContentReport): Promise<ContentReportRecord> {
    const pending = report.pendingModeration();
    // Defensive: the use-case always calls moderate() first; null here is a programming error.
    if (!pending) {
      throw new Error('saveModeration called without a pending moderation — moderate() must run first');
    }
    return toRecord(
      await tx.contentReport.update({
        where: { id: report.id },
        data: {
          status: pending.status,
          resolutionNote: pending.resolutionNote,
          handledByUserId: pending.handledByUserId,
          handledAt: pending.handledAt,
        },
        select,
      }),
    );
  }
```

(Xóa hẳn method `updateStatus`. Lưu ý: `ContentReportStatus` VẪN cần import — method `list` dùng nó
ở `const statuses: ContentReportStatus[]`; chỉ `CreateContentReportInput` là bỏ được.)

- [ ] **Step 4: Viết lại `create-content-report.use-case.ts`** (toàn bộ file)

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { CreateContentReportInput, CreateContentReportResponse } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toContentReportResponse } from '../content-report.mapper';
import { ContentReport } from '../../domain/entities/content-report.entity';
import { ReporterNotFound, ReportTargetNotFound } from '../../domain/errors/content-report-errors';
import {
  CONTENT_REPORT_REPOSITORY,
  type IContentReportRepository,
} from '../../domain/ports/content-report-repository.port';
import {
  CONTENT_REPORT_TENANT_READER,
  type IContentReportTenantReader,
} from '../../domain/ports/content-report-tenant-reader.port';

@Injectable()
export class CreateContentReportUseCase {
  constructor(
    @Inject(CONTENT_REPORT_REPOSITORY) private readonly reports: IContentReportRepository,
    @Inject(CONTENT_REPORT_TENANT_READER) private readonly tenants: IContentReportTenantReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    reporterUserId: string,
    input: CreateContentReportInput,
  ): Promise<CreateContentReportResponse> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId) throw new TenantNotFound();
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const [target, reporterName] = await Promise.all([
        this.reports.findPublishedTarget(tx, input.target, input.targetId),
        this.reports.getReporterName(tx, reporterUserId),
      ]);
      if (!target) throw new ReportTargetNotFound();
      if (!reporterName) throw new ReporterNotFound();
      const result = await this.reports.createOrFindActive(
        tx,
        tenantId,
        ContentReport.open({
          target,
          reporterUserId,
          reporterName,
          reason: input.reason,
          details: input.details || null,
        }),
      );
      return { report: toContentReportResponse(result.report), duplicate: result.duplicate };
    });
  }
}
```

- [ ] **Step 5: Viết lại `update-content-report.use-case.ts`** (toàn bộ file)

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { ContentReportResponse, UpdateContentReportInput } from '@booking/contracts';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toContentReportResponse } from '../content-report.mapper';
import { ContentReport } from '../../domain/entities/content-report.entity';
import { ContentReportNotFound } from '../../domain/errors/content-report-errors';
import {
  CONTENT_REPORT_REPOSITORY,
  type IContentReportRepository,
} from '../../domain/ports/content-report-repository.port';

@Injectable()
export class UpdateContentReportUseCase {
  constructor(
    @Inject(CONTENT_REPORT_REPOSITORY) private readonly reports: IContentReportRepository,
    private readonly tenantDb: TenantDbService,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    actorUserId: string,
    input: UpdateContentReportInput,
  ): Promise<ContentReportResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const state = await this.reports.loadForModeration(tx, id);
      if (!state) throw new ContentReportNotFound();
      const report = ContentReport.rehydrate(state);
      report.moderate({
        status: input.status,
        resolutionNote: input.resolutionNote || null,
        handledByUserId: actorUserId,
        // Same clock source as before the refactor (repo used app-clock `new Date()`);
        // switching to the DB clock is a recorded follow-up, not done here.
        now: new Date(),
      });
      const updated = await this.reports.saveModeration(tx, report);
      await this.audit.write(tx, {
        tenantId,
        actorUserId,
        action: 'content_report.status_changed',
        entityType: 'content_report',
        entityId: id,
        data: {
          fromStatus: report.status,
          toStatus: input.status,
          resolutionNote: input.resolutionNote ?? null,
          targetType: report.target,
          targetId: report.targetId,
        },
      });
      return toContentReportResponse(updated);
    });
  }
}
```

- [ ] **Step 6: Get/List use-case chuyển sang reader + GET dùng domain error**

`get-content-report.use-case.ts`: đổi import khối port thành

```ts
import { ContentReportNotFound } from '../../domain/errors/content-report-errors';
import {
  CONTENT_REPORT_READER,
  type IContentReportReader,
} from '../../domain/ports/content-report-reader.port';
```

constructor inject `@Inject(CONTENT_REPORT_READER) private readonly reports: IContentReportReader`;
thay khối `throw new NotFoundException({...})` bằng `throw new ContentReportNotFound();`; bỏ import
`NotFoundException` (giữ `Inject, Injectable`).

`list-content-reports.use-case.ts`: tương tự đổi sang `CONTENT_REPORT_READER` /
`IContentReportReader` (không có error nào).

`content-report.mapper.ts` dòng 2: `import type { ContentReportRecord } from '../domain/ports/content-report-reader.port';`

- [ ] **Step 7: Wiring `content-reports.module.ts`**

Thêm import `CONTENT_REPORT_READER` từ reader port, và trong `providers` thay dòng
`{ provide: CONTENT_REPORT_REPOSITORY, useClass: PrismaContentReportRepository },` bằng:

```ts
    PrismaContentReportRepository,
    { provide: CONTENT_REPORT_REPOSITORY, useExisting: PrismaContentReportRepository },
    { provide: CONTENT_REPORT_READER, useExisting: PrismaContentReportRepository },
```

- [ ] **Step 8: Typecheck + lint + build**

```bash
pnpm --filter=@booking/api typecheck && pnpm --filter=@booking/api lint && pnpm --filter=@booking/api build
```
Expected: cả 3 exit 0.

- [ ] **Step 9: Đối chiếu wire (đọc, không chạy)** — `git diff HEAD -- apps/api/src/modules/content-reports`

| Path | Cũ | Mới |
|---|---|---|
| Host không resolve tenant | 404 `TENANT_NOT_FOUND` 'Tenant not found' | shared `TenantNotFound` → filter, y hệt |
| Target không published/approved | 404 `REPORT_TARGET_NOT_FOUND` 'Published listing or group not found' | `ReportTargetNotFound` |
| Reporter không tồn tại | 404 `REPORTER_NOT_FOUND` 'Reporter not found' | `ReporterNotFound` |
| GET/PATCH id không tồn tại | 404 `CONTENT_REPORT_NOT_FOUND` 'Content report not found' | `ContentReportNotFound` |
| Báo cáo trùng (active) | 200 `{ report, duplicate: true }` | không đổi (repo giữ skipDuplicates+refetch) |
| PATCH resolved→open (gap any→any) | 200, cho phép | 200, cho phép (KHÔNG siết) |
| handledAt | terminal ? new Date() : null (repo) | entity quyết, use-case cấp `new Date()` — same clock |
| Audit payload | `{ fromStatus, toStatus, resolutionNote(?? null), targetType, targetId }` sau khi update | y hệt, thứ tự y hệt |

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/content-reports
git commit -m "refactor(content-reports): write-path qua ContentReport aggregate + tách reader port

Rule terminal/handledAt + active-statuses dời từ repo vào entity; duplicate
blocking giữ skipDuplicates + partial unique + refetch; any→any status GIỮ
NGUYÊN (known gap spec §8a). Wire + audit payload byte-identical.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Docs

**Files:**
- Modify: `apps/api/CLAUDE.md` (câu "Refactored so far: **reviews**.")
- Modify: `docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md` (nit dòng dài từ re-review)

- [ ] **Step 1:** Trong `apps/api/CLAUDE.md`, đổi `Refactored so far: **reviews**.` thành
  `Refactored so far: **reviews, content-reports**.`
- [ ] **Step 2:** Trong spec, bullet "**Domain events**" (§3): rewrap để mọi dòng ≤ ~100 ký tự
  (chỉ đổi line break, không đổi chữ — fix nit từ re-review PR #1).
- [ ] **Step 3: Commit**

```bash
git add apps/api/CLAUDE.md docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md
git commit -m "docs(api): content-reports vào danh sách entity-style + rewrap spec

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Verify toàn bộ + runtime smoke + PR

- [ ] **Step 1: Full suite** — `nvm use` rồi `pnpm turbo lint typecheck build`. Expected: xanh hết.
- [ ] **Step 2: Hạ tầng + API** — như PR #1: `docker ps` kiểm tra postgres/redis đã chạy;
  `prisma:deploy` + `seed` nếu cần; boot riêng API (`PORT=3001` nếu 3000 bận), chờ
  "Nest application successfully started", smoke xong thì kill.
- [ ] **Step 3: Headless smoke (curl, bắt exact body):**
  1. Login customer (`customer@studiohub.vn`) → lấy 1 listing published id (psql hoặc public API) →
     POST report (reason ví dụ `misleading`) → 2xx `{ report: {...}, duplicate: false }`.
  2. POST lại y hệt → 2xx `{ duplicate: true }` (KHÔNG phải lỗi).
  3. Login tenant owner (`owner@studiohub.vn`, header `x-tenant-id`) → PATCH report
     `{ status: 'reviewing' }` → 200, `handledAt: null`, `handledByUserId` set.
  4. PATCH `{ status: 'resolved', resolutionNote: 'Đã kiểm tra và xử lý xong' }` → 200,
     `handledAt` ≠ null.
  5. PATCH `{ status: 'open' }` (gap any→any — resolved→open) → **200 và được phép** (chứng minh
     behavior-preserving), `handledAt` quay về null.
  6. PATCH id uuid không tồn tại → 404 body exact
     `{"statusCode":404,"code":"CONTENT_REPORT_NOT_FOUND","message":"Content report not found"}`.
  7. psql: bảng `audit_logs` có các row `content_report.status_changed` với
     `data.fromStatus`/`toStatus` đúng chuỗi transition ở trên.
- [ ] **Step 4: Push + PR**

```bash
git push -u origin refactor/entity-content-reports
gh pr create --base refactor/entity-centric --title "refactor(content-reports): PR #2 — ContentReport aggregate" --body "$(cat <<'EOF'
PR #2 của entity-centric refactor (spec docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md, style-gate 2026-07-23).

- ContentReport aggregate: terminal/handledAt + active-statuses dời từ repo vào entity; moderate() expose pre-image status cho audit
- Tách reader port (CONTENT_REPORT_READER) theo rule tách-khi-fat; token write giữ nguyên
- Duplicate blocking giữ nguyên skipDuplicates + DB partial unique + refetch (luật CAS)
- KNOWN GAP GIỮ NGUYÊN (spec §8a): status any→any vẫn cho phép — smoke có case resolved→open chứng minh
- Dùng shared TenantNotFound; GET/PATCH not-found qua domain error — wire byte-identical
- Audit payload content_report.status_changed giữ nguyên shape + thứ tự ghi

Verify: pnpm turbo lint typecheck build xanh + headless smoke 7 case (create/duplicate/reviewing/resolved/reopen/404/audit rows).
Outbox: module không produce/consume event nào — không đụng.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5:** Báo controller kết quả — KHÔNG tự merge, KHÔNG tự làm PR #3.
