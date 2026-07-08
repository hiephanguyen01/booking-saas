import { BadRequestException, Injectable } from '@nestjs/common';
import type { AttributeField } from '@booking/shared';
import { validateAttributes } from '../../domain/attribute-schema';

/**
 * Throws when a listing's attribute values don't match its type's schema (§7.3).
 * Exported by CatalogModule so Task 1.4 can validate on listing create/update.
 */
@Injectable()
export class AttributeValidatorService {
  assertValidAttributes(schema: AttributeField[], values: Record<string, unknown>): void {
    const errors = validateAttributes(schema, values);
    if (errors.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_ATTRIBUTES',
        message: 'Attribute values do not match the listing type schema',
        details: errors,
      });
    }
  }
}
