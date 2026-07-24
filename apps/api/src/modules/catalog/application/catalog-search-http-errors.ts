import { BadRequestException, NotFoundException } from '@nestjs/common';

/**
 * Legacy public-search errors intentionally keep their historical body without
 * `statusCode`. They remain Nest exceptions instead of DomainError so the
 * entity-centric cleanup does not alter the wire shape.
 */
export class CatalogListingTypeNotFound extends NotFoundException {
  constructor() {
    super({ code: 'LISTING_TYPE_NOT_FOUND', message: 'Listing type not found' });
  }
}

export class CatalogModeNotAllowed extends BadRequestException {
  constructor(mode: string) {
    super({
      code: 'MODE_NOT_ALLOWED',
      message: `Listing type does not support mode "${mode}"`,
    });
  }
}

export class CatalogDateFilterDisabled extends BadRequestException {
  constructor() {
    super({
      code: 'DATE_FILTER_DISABLED',
      message: 'This listing type does not use a date filter',
    });
  }
}

export class CatalogScheduleQueryInvalid extends BadRequestException {
  constructor(message: string) {
    super({ code: 'INVALID_SCHEDULE_QUERY', message });
  }
}

export class CatalogAttributeFilterInvalid extends BadRequestException {
  constructor(key: string) {
    super({
      code: 'INVALID_ATTRIBUTE_FILTER',
      message: `Attribute "${key}" is not filterable`,
    });
  }
}

export class InvalidCatalogSearch extends BadRequestException {
  constructor(issues: unknown) {
    super({
      statusCode: 400,
      code: 'INVALID_CATALOG_SEARCH',
      message: 'Invalid catalog search query',
      issues,
    });
  }
}
