import { describe, expect, it } from 'vitest';

import { resolveDetailFieldContent } from './detail-field';

describe('resolveDetailFieldContent', () => {
  it('lets an explicit state override the value', () => {
    expect(
      resolveDetailFieldContent({ value: 'anything', state: { kind: 'failed' } }),
    ).toEqual({ render: 'state', state: { kind: 'failed' } });

    expect(
      resolveDetailFieldContent({
        value: '0123456789',
        state: { kind: 'suppressed', reason: 'no permission' },
      }),
    ).toEqual({ render: 'state', state: { kind: 'suppressed', reason: 'no permission' } });
  });

  it('renders the em-dash empty state for null/undefined/empty-string values', () => {
    for (const value of [null, undefined, '']) {
      expect(resolveDetailFieldContent({ value })).toEqual({
        render: 'state',
        state: { kind: 'empty' },
      });
    }
  });

  it('drops the field entirely when empty and omitWhenEmpty is set', () => {
    expect(resolveDetailFieldContent({ value: '', omitWhenEmpty: true })).toEqual({
      render: 'hidden',
    });
    expect(resolveDetailFieldContent({ value: null, omitWhenEmpty: true })).toEqual({
      render: 'hidden',
    });
  });

  it('treats 0 and false as real values (not empty)', () => {
    expect(resolveDetailFieldContent({ value: 0 })).toEqual({ render: 'value' });
    expect(resolveDetailFieldContent({ value: false })).toEqual({ render: 'value' });
  });

  it('renders a non-empty value', () => {
    expect(resolveDetailFieldContent({ value: 'Nguyễn Văn A' })).toEqual({ render: 'value' });
  });
});
