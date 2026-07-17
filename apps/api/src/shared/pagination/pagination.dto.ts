import { createZodDto } from 'nestjs-zod';
import { paginationQuerySchema } from '@booking/contracts';

/**
 * Base `?page&pageSize` query DTO for pagination-only list endpoints. Endpoints
 * that also filter define their own `createZodDto(paginationQuerySchema.extend({…}))`
 * in their module's dto file (from `@booking/contracts`).
 */
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
