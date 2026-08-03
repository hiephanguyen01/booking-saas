import type { AttributeField } from '@booking/contracts';

export interface AttributeError {
  key: string;
  message: string;
}

/**
 * Validates a listing's `attributes` values against its type's attribute schema
 * (§7.3). Pure — reused by Task 1.4 at listing create/update. Rejects unknown
 * keys, missing required fields, and per-type value mismatches.
 */
export function validateAttributes(
  schema: AttributeField[],
  values: Record<string, unknown>,
): AttributeError[] {
  const errors: AttributeError[] = [];
  const byKey = new Map(schema.map((f) => [f.key, f]));

  for (const key of Object.keys(values)) {
    if (!byKey.has(key)) {
      errors.push({ key, message: `Thuộc tính “${key}” không còn được hỗ trợ` });
    }
  }

  for (const field of schema) {
    const value = values[field.key];
    const present =
      value !== undefined &&
      value !== null &&
      value !== '' &&
      (!Array.isArray(value) || value.length > 0);
    if (!present) {
      if (field.required) {
        errors.push({ key: field.key, message: `Vui lòng nhập ${field.label}` });
      }
      continue;
    }
    switch (field.type) {
      case 'text':
        if (typeof value !== 'string') {
          errors.push({ key: field.key, message: `${field.label} phải là văn bản` });
        }
        break;
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          errors.push({ key: field.key, message: `${field.label} phải là một số` });
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push({ key: field.key, message: `Vui lòng chọn trạng thái cho ${field.label}` });
        }
        break;
      case 'select':
        if (typeof value !== 'string' || !field.options?.includes(value)) {
          errors.push({
            key: field.key,
            message: `Vui lòng chọn ${field.label}`,
          });
        }
        break;
      case 'multiselect': {
        const options = field.options ?? [];
        const ok =
          Array.isArray(value) && value.every((v) => typeof v === 'string' && options.includes(v));
        if (!ok) {
          errors.push({
            key: field.key,
            message: `${field.label} chứa lựa chọn không hợp lệ`,
          });
        }
        break;
      }
      case 'list': {
        const ok =
          Array.isArray(value) && value.every((v) => typeof v === 'string' && v.trim() !== '');
        if (!ok) {
          errors.push({ key: field.key, message: `${field.label} phải là danh sách văn bản` });
        }
        break;
      }
    }
  }

  return errors;
}
