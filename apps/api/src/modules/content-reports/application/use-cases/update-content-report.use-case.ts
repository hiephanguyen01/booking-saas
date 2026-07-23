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
