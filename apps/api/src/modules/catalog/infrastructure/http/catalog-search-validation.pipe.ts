import type { PipeTransform } from '@nestjs/common';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  publicCatalogSearchQuerySchema,
  type PublicCatalogSearchQuery,
} from '@booking/contracts';

/** Typed catalog-query boundary retaining the existing INVALID_CATALOG_SEARCH body. */
@Injectable()
export class CatalogSearchValidationPipe
  implements PipeTransform<unknown, PublicCatalogSearchQuery>
{
  transform(value: unknown): PublicCatalogSearchQuery {
    const parsed = publicCatalogSearchQuerySchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_CATALOG_SEARCH',
        message: 'Invalid catalog search query',
        issues: parsed.error.issues,
      });
    }
    return parsed.data;
  }
}
