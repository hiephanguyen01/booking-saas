import { describe, expect, it } from 'vitest';
import {
  dateSelectionForMode,
  locationSelectOptions,
  matchesArea,
  parseSearchState,
  rangeDates,
  searchContextParams,
  validDailyRange,
} from './search-state';

describe('storefront search state', () => {
  it('normalizes hourly values and repeated amenities', () => {
    const params = new URLSearchParams('mode=hourly&date=2026-08-10&guests=3&location=Qu%E1%BA%ADn+1&amenities=wifi&amenities=parking,wifi');
    const state = parseSearchState(params);
    expect(state).toMatchObject({
      mode: 'hourly',
      date: '2026-08-10',
      hasDateSelection: true,
      guests: 3,
      location: 'Quận 1',
    });
    expect(state.amenities).toEqual(['wifi', 'parking']);
  });

  it('normalizes an invalid daily range', () => {
    const state = parseSearchState(new URLSearchParams('mode=daily&from=2026-08-10&to=2026-08-09'));
    expect(state.to).toBe('2026-08-11');
    expect(state.hasDailyRange).toBe(false);
  });

  it('serializes only the active date shape', () => {
    const state = parseSearchState(new URLSearchParams('mode=daily&from=2026-08-10&to=2026-08-13&q=portrait'));
    const params = searchContextParams(state);
    expect(params.get('date')).toBeNull();
    expect(params.get('from')).toBe('2026-08-10');
    expect(params.get('q')).toBe('portrait');

    const hourly = parseSearchState(new URLSearchParams('mode=hourly&date=2026-08-12&from=2026-08-10&to=2026-08-13'));
    const hourlyParams = searchContextParams(hourly);
    expect(hourlyParams.get('date')).toBe('2026-08-12');
    expect(hourlyParams.get('from')).toBeNull();
    expect(hourlyParams.get('to')).toBeNull();
  });

  it('builds a half-open date range and area buckets', () => {
    expect(rangeDates('2026-08-10', '2026-08-13')).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
    expect(matchesArea('25-50', 35)).toBe(true);
    expect(matchesArea('25-50', 50)).toBe(false);
    expect(matchesArea('over-100', null)).toBe(true);
  });

  it('deduplicates, sorts, and preserves the selected location', () => {
    expect(locationSelectOptions(['Quận 1', ' quan 1 ', 'Hà Nội'], 'Đà Nẵng')).toEqual([
      'Đà Nẵng',
      'Hà Nội',
      'Quận 1',
    ]);
  });

  it('clears every date selection when switching modes', () => {
    expect(dateSelectionForMode('daily')).toEqual({
      mode: 'daily',
      date: '',
      from: '',
      to: '',
    });
    expect(dateSelectionForMode('hourly')).toEqual({
      mode: 'hourly',
      date: '',
      from: '',
      to: '',
    });
  });

  it('keeps time unselected when the URL has no explicit date values', () => {
    const state = parseSearchState(new URLSearchParams());
    expect(state.hasDateSelection).toBe(false);
    expect(state.hasDailyRange).toBe(false);
    expect(searchContextParams(state).has('date')).toBe(false);
    expect(searchContextParams(state).has('from')).toBe(false);
    expect(searchContextParams(state).has('to')).toBe(false);
  });

  it('accepts only a complete increasing daily range', () => {
    expect(validDailyRange('2026-08-10', undefined)).toBeNull();
    expect(validDailyRange('2026-08-10', '2026-08-10')).toBeNull();
    expect(validDailyRange('2026-08-10', '2026-08-09')).toBeNull();
    expect(validDailyRange('2026-08-10', '2026-08-12')).toEqual({
      from: '2026-08-10',
      to: '2026-08-12',
    });
  });
});
