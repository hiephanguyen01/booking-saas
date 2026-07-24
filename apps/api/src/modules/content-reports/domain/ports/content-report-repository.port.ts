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
  /**
   * Persist only while the stored status still equals the aggregate pre-image.
   * `null` is a CAS miss, not a not-found signal.
   */
  saveModeration(tx: PrismaTx, report: ContentReport): Promise<ContentReportRecord | null>;
}
