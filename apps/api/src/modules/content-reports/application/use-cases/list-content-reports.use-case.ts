import { Inject, Injectable } from '@nestjs/common';
import type { ContentReportListResponse, TenantContentReportsQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toContentReportResponse } from '../content-report.mapper';
import {
  CONTENT_REPORT_REPOSITORY,
  type IContentReportRepository,
} from '../../domain/ports/content-report-repository.port';

@Injectable()
export class ListContentReportsUseCase {
  constructor(
    @Inject(CONTENT_REPORT_REPOSITORY) private readonly reports: IContentReportRepository,
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
