import type { AttributeField } from '@booking/contracts';

const MAX_KEY_LENGTH = 40;
const FALLBACK_KEY = 'thuoc_tinh';

/** Converts a Vietnamese display label into the internal identifier expected by the API. */
export function attributeKeyFromLabel(label: string): string {
  const normalized = label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safeStart = /^[a-z]/.test(normalized) ? normalized : `field_${normalized}`;

  return (safeStart || FALLBACK_KEY).slice(0, MAX_KEY_LENGTH).replace(/_+$/g, '');
}

/** Generates a key without colliding with another row in the same attribute schema. */
export function uniqueAttributeKey(
  label: string,
  fields: AttributeField[],
  currentIndex: number,
): string {
  const used = new Set(
    fields
      .filter((_, index) => index !== currentIndex)
      .map((field) => field.key)
      .filter(Boolean),
  );
  const base = attributeKeyFromLabel(label);
  if (!used.has(base)) return base;

  let sequence = 2;
  while (sequence < 10_000) {
    const suffix = `_${sequence}`;
    const candidate = `${base.slice(0, MAX_KEY_LENGTH - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
    sequence += 1;
  }

  return `${FALLBACK_KEY}_${currentIndex + 1}`;
}

/** Fills only missing keys, preserving stable identifiers on existing attributes. */
export function withGeneratedAttributeKeys(fields: AttributeField[]): AttributeField[] {
  return fields.map((field, index, allFields) =>
    field.key ? field : { ...field, key: uniqueAttributeKey(field.label, allFields, index) },
  );
}
