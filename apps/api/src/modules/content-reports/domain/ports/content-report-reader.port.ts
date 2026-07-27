import type {
  ContentReportReason,
  ContentReportStatus,
  ContentReportTarget,
  TenantContentReportsQuery,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPageWithCounts } from '../../../../shared/pagination/pagination';

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
  reason: ContentReportReason;
  details: string | null;
  status: ContentReportStatus;
  handledByUserId: string | null;
  resolutionNote: string | null;
  handledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ContentReportPage = RepoPageWithCounts<ContentReportRecord>;

export interface IContentReportReader {
  list(tx: PrismaTx, query: TenantContentReportsQuery): Promise<ContentReportPage>;
  findById(tx: PrismaTx, id: string): Promise<ContentReportRecord | null>;
}
