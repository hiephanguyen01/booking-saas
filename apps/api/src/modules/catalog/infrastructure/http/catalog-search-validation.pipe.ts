import type { PipeTransform } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { publicCatalogSearchQuerySchema, type PublicCatalogSearchQuery } from '@booking/contracts';
import { InvalidCatalogSearch } from '../../application/catalog-search-http-errors';

/** Typed catalog-query boundary retaining the existing INVALID_CATALOG_SEARCH body. */
@Injectable()
export class CatalogSearchValidationPipe implements PipeTransform<
  unknown,
  PublicCatalogSearchQuery
> {
  transform(value: unknown): PublicCatalogSearchQuery {
    const parsed = publicCatalogSearchQuerySchema.safeParse(value);
    if (!parsed.success) {
      throw new InvalidCatalogSearch(parsed.error.issues);
    }
    return parsed.data;
  }
}
