import type {
  ContentReportReason,
  ContentReportStatus,
  ContentReportTarget,
} from '@booking/contracts';
import {
  ContentReportInvalidTransition,
  ContentReportValidationError,
} from '../errors/content-report-errors';

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
 * Framework-free: no Nest, no Prisma, no zod (contracts imports are type-only).
 */

/** The "active" statuses that block a duplicate report; mirrors the DB partial unique index. */
export const ACTIVE_CONTENT_REPORT_STATUSES: readonly ContentReportStatus[] = ['open', 'reviewing'];

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
   */
  moderate(input: {
    status: ContentReportStatus;
    resolutionNote: string | null;
    handledByUserId: string;
    now: Date;
  }): void {
    const allowed =
      (this.state.status === 'open' && input.status === 'reviewing') ||
      (this.state.status === 'reviewing' &&
        (input.status === 'resolved' || input.status === 'dismissed'));
    if (!allowed) {
      throw new ContentReportInvalidTransition(this.state.status, input.status);
    }
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
