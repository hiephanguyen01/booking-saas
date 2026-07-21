import type { ContentReportResponse } from '@booking/contracts';
import type { ContentReportRecord } from '../domain/ports/content-report-repository.port';

export function toContentReportResponse(record: ContentReportRecord): ContentReportResponse {
  return {
    ...record,
    handledAt: record.handledAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
