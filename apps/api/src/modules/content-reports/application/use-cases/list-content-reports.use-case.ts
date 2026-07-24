import { Inject, Injectable } from '@nestjs/common';
import type { ContentReportListResponse, TenantContentReportsQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toContentReportResponse } from '../content-report.mapper';
import {
  CONTENT_REPORT_READER,
  type IContentReportReader,
} from '../../domain/ports/content-report-reader.port';

@Injectable()
export class ListContentReportsUseCase {
  constructor(
    @Inject(CONTENT_REPORT_READER) private readonly reports: IContentReportReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    query: TenantContentReportsQuery,
  ): Promise<ContentReportListResponse> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const page = await this.reports.list(tx, query);
      return {
        ...page,
        items: page.items.map(toContentReportResponse),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }
}
