import type { ContentReportResponse } from '@booking/contracts';
import type { ContentReportRecord } from '../domain/ports/content-report-reader.port';

export function toContentReportResponse(record: ContentReportRecord): ContentReportResponse {
  return {
    id: record.id,
    target: record.target,
    targetId: record.targetId,
    targetTitle: record.targetTitle,
    targetSlug: record.targetSlug,
    partnerId: record.partnerId,
    partnerName: record.partnerName,
    reporterUserId: record.reporterUserId,
    reporterName: record.reporterName,
    reason: record.reason,
    details: record.details,
    status: record.status,
    handledByUserId: record.handledByUserId,
    resolutionNote: record.resolutionNote,
    handledAt: record.handledAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
