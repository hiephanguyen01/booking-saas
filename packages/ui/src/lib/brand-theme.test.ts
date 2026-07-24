import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brandContrastForeground, sanitizeBrandColor } from './brand-theme.ts';

const FG_DARK = 'oklch(0.145 0 0)';
const FG_LIGHT = 'oklch(0.985 0 0)';

test('accepts only functional colors whose contrast can be measured', () => {
  const accepted = [
    '#0ea5e9',
    'rgb(14 165 233)',
    'hsl(199 89% 48%)',
    'oklch(0.7 0.15 230)',
    'oklab(0.7 -0.05 -0.1)',
  ];

  for (const color of accepted) {
    assert.equal(sanitizeBrandColor(color), color);
    assert.notEqual(brandContrastForeground(color), null);
  }

  for (const color of ['var(--primary)', 'lab(50% 0 0)', 'hsl(200 50 40)', 'oklch(foo)']) {
    assert.equal(sanitizeBrandColor(color), null);
  }
});

test('chooses readable foregrounds for light and dark functional colors', () => {
  assert.equal(brandContrastForeground('hsl(0 0% 100%)'), FG_DARK);
  assert.equal(brandContrastForeground('hsl(0 0% 0%)'), FG_LIGHT);
  assert.equal(brandContrastForeground('oklch(1 0 0)'), FG_DARK);
  assert.equal(brandContrastForeground('oklch(0 0 0)'), FG_LIGHT);
});
