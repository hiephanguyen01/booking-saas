import { I18nProvider, createTranslator } from '@booking/i18n';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { parseSearchState } from '../../search/search-state';
import { FilterPanel } from './filter-panel';

function render(node: ReactNode, search = ''): string {
  const router = createMemoryRouter(
    [
      {
        path: '/vi/t/:typeSlug',
        element: <I18nProvider value={createTranslator('vi')}>{node}</I18nProvider>,
      },
    ],
    { initialEntries: [`/vi/t/studio${search}`] },
  );
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function panel(search: string, locations: string[], amenities: string[] = []): string {
  return render(
    <FilterPanel
      state={parseSearchState(new URLSearchParams(search))}
      locations={locations}
      amenities={amenities}
    />,
    search ? `?${search}` : '',
  );
}

describe('FilterPanel', () => {
  it('submits location values the search matcher can match', () => {
    const html = panel('', ['Quận 1', 'TP Hồ Chí Minh']);

    // containsLocation() substring-matches the listing's address text, so the
    // control has to submit the address strings themselves — a slug never matched.
    expect(html).toContain('name="location" value="Quận 1"');
    expect(html).not.toContain('value="quan-1"');
  });

  it('leaves the price bounds empty unless the URL set them', () => {
    expect(panel('', [])).toContain('name="minPrice" value=""');
    expect(panel('minPrice=200000', [])).toContain('name="minPrice" value="200.000"');
  });

  it('carries the active sort through a filter submit', () => {
    expect(panel('sort=price-asc', [])).toContain('name="sort" value="price-asc"');
    expect(panel('', [])).not.toContain('name="sort"');
  });

  it('keeps a selected option out of the collapsed overflow', () => {
    // Only the first six locations render; Radix unmounts the collapsed rest, and
    // an unmounted control submits nothing — so the active one has to lead.
    const overflowing = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Zulu'];
    const html = panel('location=Zulu', overflowing);

    expect(html).toContain('checked="" value="Zulu"');
    expect(html).not.toContain('value="Golf"');
  });

  it('offers no rating control, since no rating data exists', () => {
    expect(panel('', [])).not.toContain('name="rating"');
  });
});
