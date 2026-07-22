import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateContentReportInput, CreateContentReportResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toContentReportResponse } from '../content-report.mapper';
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
    if (!tenantId)
      throw new NotFoundException({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const [target, reporterName] = await Promise.all([
        this.reports.findPublishedTarget(tx, input.target, input.targetId),
        this.reports.getReporterName(tx, reporterUserId),
      ]);
      if (!target)
        throw new NotFoundException({
          statusCode: 404,
          code: 'REPORT_TARGET_NOT_FOUND',
          message: 'Published listing or group not found',
        });
      if (!reporterName)
        throw new NotFoundException({
          statusCode: 404,
          code: 'REPORTER_NOT_FOUND',
          message: 'Reporter not found',
        });
      const result = await this.reports.createOrFindActive(
        tx,
        tenantId,
        reporterUserId,
        reporterName,
        target,
        input,
      );
      return { report: toContentReportResponse(result.report), duplicate: result.duplicate };
    });
  }
}
