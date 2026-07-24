import type { AttributeField } from '@booking/contracts';
import { validateAttributes } from '../domain/attribute-schema';
import { InvalidAttributes } from '../domain/errors/listing-type-errors';

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
    throw new InvalidAttributes(errors);
  }
}
