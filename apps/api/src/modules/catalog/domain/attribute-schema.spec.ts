import { describe, expect, it } from 'vitest';
import { createListingTypeInputSchema, type AttributeField } from '@booking/contracts';
import { validateAttributes } from './attribute-schema';

const schema: AttributeField[] = [
  { key: 'area', label: 'Area', type: 'number', required: true, filterable: true },
  { key: 'style', label: 'Style', type: 'select', required: false, filterable: true, options: ['A', 'B'] },
  { key: 'tags', label: 'Tags', type: 'multiselect', required: false, filterable: false, options: ['x', 'y', 'z'] },
  { key: 'light', label: 'Light', type: 'boolean', required: false, filterable: true },
  { key: 'note', label: 'Note', type: 'text', required: false, filterable: false },
];

describe('validateAttributes', () => {
  it('accepts a fully valid value set', () => {
    expect(
      validateAttributes(schema, { area: 40, style: 'A', tags: ['x', 'y'], light: true, note: 'hi' }),
    ).toEqual([]);
  });

  it('flags a missing required field', () => {
    const errors = validateAttributes(schema, { style: 'A' });
    expect(errors.map((e) => e.key)).toContain('area');
  });

  it('flags type mismatches per field type', () => {
    expect(validateAttributes(schema, { area: 'not-a-number' }).some((e) => e.key === 'area')).toBe(true);
    expect(validateAttributes(schema, { area: 1, light: 'yes' }).some((e) => e.key === 'light')).toBe(true);
    expect(validateAttributes(schema, { area: 1, note: 5 }).some((e) => e.key === 'note')).toBe(true);
  });

  it('flags a select value outside its options', () => {
    expect(validateAttributes(schema, { area: 1, style: 'Z' }).some((e) => e.key === 'style')).toBe(true);
  });

  it('flags a multiselect that is not a subset of options', () => {
    expect(validateAttributes(schema, { area: 1, tags: ['x', 'q'] }).some((e) => e.key === 'tags')).toBe(true);
  });

  it('flags unknown keys', () => {
    expect(validateAttributes(schema, { area: 1, foo: 2 }).some((e) => e.key === 'foo')).toBe(true);
  });
});

describe('createListingTypeInputSchema', () => {
  it('rejects defaultModes that are not a subset of allowedModes', () => {
    const r = createListingTypeInputSchema.safeParse({
      name: 'X',
      slug: 'x-type',
      allowedModes: ['hourly'],
      defaultModes: ['daily'],
    });
    expect(r.success).toBe(false);
  });

  it('applies defaults for a minimal valid input', () => {
    const r = createListingTypeInputSchema.safeParse({
      name: 'X',
      slug: 'x-type',
      allowedModes: ['hourly', 'daily'],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.isActive).toBe(true);
      expect(r.data.defaultModes).toEqual([]);
      expect(r.data.requiresIdentityVerification).toBe(false);
      expect(r.data.attributeSchema).toEqual([]);
    }
  });

  it('requires options on a select attribute field', () => {
    const r = createListingTypeInputSchema.safeParse({
      name: 'X',
      slug: 'x-type',
      allowedModes: ['hourly'],
      attributeSchema: [{ key: 's', label: 'S', type: 'select' }],
    });
    expect(r.success).toBe(false);
  });
});
