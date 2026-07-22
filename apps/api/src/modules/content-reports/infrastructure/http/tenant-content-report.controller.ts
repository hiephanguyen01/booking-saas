import type { ContentReportListResponse, ContentReportResponse } from '@booking/contracts';
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { GetContentReportUseCase } from '../../application/use-cases/get-content-report.use-case';
import { ListContentReportsUseCase } from '../../application/use-cases/list-content-reports.use-case';
import { UpdateContentReportUseCase } from '../../application/use-cases/update-content-report.use-case';
import {
  ContentReportListResponseDto,
  ContentReportResponseDto,
  TenantContentReportsQueryDto,
  UpdateContentReportDto,
} from './dto/content-report.dto';

@ApiTags('tenant-content-reports')
@Controller('tenant/content-reports')
export class TenantContentReportController {
  constructor(
    private readonly listReports: ListContentReportsUseCase,
    private readonly getReport: GetContentReportUseCase,
    private readonly updateReport: UpdateContentReportUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.listings.publish')
  @Get()
  @ApiOperation({ summary: 'List customer content reports for tenant moderation' })
  @ApiOkResponse({ type: ContentReportListResponseDto })
  list(@Query() query: TenantContentReportsQueryDto): Promise<ContentReportListResponse> {
    return this.listReports.execute(this.tenantContext.tenantIdOrThrow(), query);
  }

  @RequirePermissions('tenant.listings.publish')
  @Get(':id')
  @ApiOkResponse({ type: ContentReportResponseDto })
  get(@Param('id') id: string): Promise<ContentReportResponse> {
    return this.getReport.execute(this.tenantContext.tenantIdOrThrow(), id);
  }

  @RequirePermissions('tenant.listings.publish')
  @Patch(':id')
  @ApiOkResponse({ type: ContentReportResponseDto })
  update(
    @Param('id') id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: UpdateContentReportDto,
  ): Promise<ContentReportResponse> {
    return this.updateReport.execute(
      this.tenantContext.tenantIdOrThrow(),
      id,
      principal.userId,
      input,
    );
  }
}
