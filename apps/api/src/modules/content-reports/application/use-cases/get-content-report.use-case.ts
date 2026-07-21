import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ContentReportResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toContentReportResponse } from '../content-report.mapper';
import {
  CONTENT_REPORT_REPOSITORY,
  type IContentReportRepository,
} from '../../domain/ports/content-report-repository.port';

@Injectable()
export class GetContentReportUseCase {
  constructor(
    @Inject(CONTENT_REPORT_REPOSITORY) private readonly reports: IContentReportRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string): Promise<ContentReportResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const report = await this.reports.findById(tx, id);
      if (!report)
        throw new NotFoundException({
          statusCode: 404,
          code: 'CONTENT_REPORT_NOT_FOUND',
          message: 'Content report not found',
        });
      return toContentReportResponse(report);
    });
  }
}
