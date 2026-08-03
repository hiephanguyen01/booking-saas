import type { AttributeField } from '@booking/contracts';

export interface ListingAttributeIssue {
  key: string;
  message: string;
}

export function validateListingAttributes(
  schema: AttributeField[],
  values: Record<string, unknown>,
): ListingAttributeIssue[] {
  const issues: ListingAttributeIssue[] = [];
  const fields = new Map(schema.map((field) => [field.key, field]));

  for (const key of Object.keys(values)) {
    if (!fields.has(key)) issues.push({ key, message: 'Thuộc tính này không còn được hỗ trợ' });
  }

  for (const field of schema) {
    const value = values[field.key];
    const present =
      value !== undefined &&
      value !== null &&
      value !== '' &&
      (!Array.isArray(value) || value.length > 0);
    if (!present) {
      if (field.required) issues.push({ key: field.key, message: `Vui lòng nhập ${field.label}` });
      continue;
    }

    if (field.type === 'text' && typeof value !== 'string') {
      issues.push({ key: field.key, message: `${field.label} phải là văn bản` });
    } else if (field.type === 'number' && (typeof value !== 'number' || Number.isNaN(value))) {
      issues.push({ key: field.key, message: `${field.label} phải là một số` });
    } else if (field.type === 'boolean' && typeof value !== 'boolean') {
      issues.push({ key: field.key, message: `Vui lòng chọn trạng thái cho ${field.label}` });
    } else if (
      field.type === 'select' &&
      (typeof value !== 'string' || !field.options?.includes(value))
    ) {
      issues.push({ key: field.key, message: `Vui lòng chọn ${field.label}` });
    } else if (
      field.type === 'multiselect' &&
      (!Array.isArray(value) ||
        value.some((item) => typeof item !== 'string' || !field.options?.includes(item)))
    ) {
      issues.push({ key: field.key, message: `${field.label} chứa lựa chọn không hợp lệ` });
    } else if (
      field.type === 'list' &&
      (!Array.isArray(value) ||
        value.some((item) => typeof item !== 'string' || item.trim() === ''))
    ) {
      issues.push({ key: field.key, message: `${field.label} phải là danh sách văn bản` });
    }
  }

  return issues;
}
