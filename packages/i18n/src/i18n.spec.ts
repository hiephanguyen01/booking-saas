import { describe, expect, it } from 'vitest';
import {
  createBookingI18n,
  createTranslator,
  en,
  flattenTranslationKeys,
  NsI18n,
  namespaces,
  vi,
} from './index';

describe('@booking/i18n', () => {
  it('exposes only the seven feature namespaces', () => {
    expect(namespaces).toEqual(Object.values(NsI18n));
    expect(namespaces).toEqual([
      NsI18n.Common,
      NsI18n.Navigation,
      NsI18n.Catalog,
      NsI18n.Listing,
      NsI18n.Checkout,
      NsI18n.Booking,
      NsI18n.Error,
    ]);
    expect(Object.keys(vi)).toEqual(namespaces);
    expect(Object.keys(en)).toEqual(namespaces);
  });

  it('keeps Vietnamese and English translation keys identical', () => {
    expect(flattenTranslationKeys(en)).toEqual(flattenTranslationKeys(vi));
  });

  it('creates isolated per-render instances', () => {
    const vietnamese = createBookingI18n('vi');
    const english = createBookingI18n('en');

    expect(vietnamese.t('common:save')).toBe('Lưu');
    expect(english.t('common:save')).toBe('Save');
    expect(english.t('navigation:lookup')).toBe('Find a booking');
    expect(vietnamese.language).toBe('vi');
    expect(english.language).toBe('en');
  });

  it('supports the typed dot-key and interpolation API', () => {
    const translator = createTranslator('en');

    expect(translator.t('listing.providedBy', { name: 'Studio One' })).toBe(
      'Offered by Studio One',
    );
    expect(translator.t('common.home.search')).toBe('Search');
    expect(translator.t('checkout.promoErrors.PROMO_EXPIRED')).toBe(
      'This code has expired.',
    );
    expect(translator.t('booking.lookup.title')).toBe('Find a booking');
  });
});
