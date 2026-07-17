import { BadRequestException } from '@nestjs/common';
import type { AttributeField } from '@booking/contracts';
import { validateAttributes } from '../domain/attribute-schema';

/**
 * Throws when a listing's attribute values don't match its type's schema (§7.3).
 * Plain-imported by the listing module at listing create/update.
 *
 * Lives in the application layer (plain function, no DI) because it translates
 * the pure domain rule ({@link validateAttributes}) into an HTTP error — the
 * domain layer stays free of `@nestjs/*` imports.
 */
export function assertValidAttributes(
  schema: AttributeField[],
  values: Record<string, unknown>,
): void {
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
