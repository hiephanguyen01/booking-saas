import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { CreateContentReportUseCase } from '../../application/use-cases/create-content-report.use-case';
import { GetContentReportUseCase } from '../../application/use-cases/get-content-report.use-case';
import { ListContentReportsUseCase } from '../../application/use-cases/list-content-reports.use-case';
import { UpdateContentReportUseCase } from '../../application/use-cases/update-content-report.use-case';
import { CONTENT_REPORT_READER } from '../../domain/ports/content-report-reader.port';
import { CONTENT_REPORT_REPOSITORY } from '../../domain/ports/content-report-repository.port';
import { CONTENT_REPORT_TENANT_READER } from '../../domain/ports/content-report-tenant-reader.port';
import { PrismaContentReportRepository } from '../repositories/prisma-content-report.repository';
import { PrismaContentReportTenantReader } from '../repositories/prisma-content-report-tenant.reader';
import { CustomerContentReportController } from './customer-content-report.controller';
import { TenantContentReportController } from './tenant-content-report.controller';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [CustomerContentReportController, TenantContentReportController],
  providers: [
    PrismaContentReportRepository,
    { provide: CONTENT_REPORT_REPOSITORY, useExisting: PrismaContentReportRepository },
    { provide: CONTENT_REPORT_READER, useExisting: PrismaContentReportRepository },
    { provide: CONTENT_REPORT_TENANT_READER, useClass: PrismaContentReportTenantReader },
    CreateContentReportUseCase,
    GetContentReportUseCase,
    ListContentReportsUseCase,
    UpdateContentReportUseCase,
  ],
})
export class ContentReportsModule {}
