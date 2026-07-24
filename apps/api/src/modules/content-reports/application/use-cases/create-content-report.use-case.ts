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
