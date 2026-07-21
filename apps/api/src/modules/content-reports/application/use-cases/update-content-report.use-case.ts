import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ContentReportResponse, UpdateContentReportInput } from '@booking/contracts';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toContentReportResponse } from '../content-report.mapper';
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
      const current = await this.reports.findById(tx, id);
      if (!current)
        throw new NotFoundException({
          statusCode: 404,
          code: 'CONTENT_REPORT_NOT_FOUND',
          message: 'Content report not found',
        });
      const updated = await this.reports.updateStatus(
        tx,
        id,
        input.status,
        input.resolutionNote || null,
        actorUserId,
      );
      await this.audit.write(tx, {
        tenantId,
        actorUserId,
        action: 'content_report.status_changed',
        entityType: 'content_report',
        entityId: id,
        data: {
          fromStatus: current.status,
          toStatus: input.status,
          resolutionNote: input.resolutionNote ?? null,
          targetType: current.target,
          targetId: current.targetId,
        },
      });
      return toContentReportResponse(updated);
    });
  }
}
