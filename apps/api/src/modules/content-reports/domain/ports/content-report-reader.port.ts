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
