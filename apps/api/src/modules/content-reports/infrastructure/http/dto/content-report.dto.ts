import { createZodDto } from 'nestjs-zod';
import {
  contentReportListResponseSchema,
  contentReportResponseSchema,
  createContentReportInputSchema,
  createContentReportResponseSchema,
  tenantContentReportsQuerySchema,
  updateContentReportInputSchema,
} from '@booking/contracts';

export class CreateContentReportDto extends createZodDto(createContentReportInputSchema) {}
export class UpdateContentReportDto extends createZodDto(updateContentReportInputSchema) {}
export class TenantContentReportsQueryDto extends createZodDto(tenantContentReportsQuerySchema) {}
export class ContentReportResponseDto extends createZodDto(contentReportResponseSchema) {}
export class CreateContentReportResponseDto extends createZodDto(
  createContentReportResponseSchema,
) {}
export class ContentReportListResponseDto extends createZodDto(contentReportListResponseSchema) {}
