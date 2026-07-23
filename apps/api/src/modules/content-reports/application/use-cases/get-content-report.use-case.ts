import { Inject, Injectable } from '@nestjs/common';
import type { ContentReportResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toContentReportResponse } from '../content-report.mapper';
import { ContentReportNotFound } from '../../domain/errors/content-report-errors';
import {
  CONTENT_REPORT_READER,
  type IContentReportReader,
} from '../../domain/ports/content-report-reader.port';

@Injectable()
export class GetContentReportUseCase {
  constructor(
    @Inject(CONTENT_REPORT_READER) private readonly reports: IContentReportReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string): Promise<ContentReportResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const report = await this.reports.findById(tx, id);
      if (!report) throw new ContentReportNotFound();
      return toContentReportResponse(report);
    });
  }
}
