import { describe, expect, it } from 'vitest';
import {
  createBookingI18n,
  createTranslator,
  en,
  flattenTranslationKeys,
  vi,
} from './index';

describe('@booking/i18n', () => {
  it('keeps Vietnamese and English translation keys identical', () => {
    expect(flattenTranslationKeys(en)).toEqual(flattenTranslationKeys(vi));
  });

  it('creates isolated per-render instances', () => {
    const vietnamese = createBookingI18n('vi');
    const english = createBookingI18n('en');

    expect(vietnamese.t('common:save')).toBe('Lưu');
    expect(english.t('common:save')).toBe('Save');
    expect(vietnamese.language).toBe('vi');
    expect(english.language).toBe('en');
  });

  it('supports the existing dot-key and interpolation API during migration', () => {
    const translator = createTranslator('en');

    expect(translator.t('listing.providedBy', { name: 'Studio One' })).toBe(
      'Offered by Studio One',
    );
    expect(translator.t('missing.key')).toBe('missing.key');
  });
});
