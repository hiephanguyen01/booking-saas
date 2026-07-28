import type { PublicCatalogFacet } from '@booking/contracts';
import { useSearchParams } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';

export interface FilterOption {
  value: string;
  label: string;
}

export type FilterFacetModel =
  | {
      kind: 'price';
      key: string;
      title: string;
      icon: string | null;
    }
  | {
      kind: 'range';
      key: string;
      title: string;
      icon: string | null;
      minName: string;
      maxName: string;
      minValue: number | '';
      maxValue: number | '';
      minPlaceholder: string;
      maxPlaceholder: string;
    }
  | {
      kind: 'options';
      key: string;
      title: string;
      icon: string | null;
      control: 'radio' | 'checkbox';
      options: FilterOption[];
      selected: string[];
      visibleCount: number;
    };

export function useFilterPanelController({
  facets,
  booleanFacetKeys,
}: {
  facets: PublicCatalogFacet[];
  booleanFacetKeys: string[];
}) {
  const { t } = useTranslation(NsI18n.Catalog);
  const [params] = useSearchParams();
  const facetModels = facets.map((facet): FilterFacetModel => {
    // System facets (price/location/amenities) carry no icon; attribute facets do.
    const icon = facet.icon ?? null;
    if (facet.key === 'price') {
      return { kind: 'price', key: facet.key, title: t('filters.price'), icon };
    }

    const title =
      facet.key === 'location'
        ? t('filters.location')
        : facet.key === 'amenities'
          ? t('filters.amenities')
          : facet.label;

    if (facet.control === 'range') {
      const minName = `${facet.key}.min`;
      const maxName = `${facet.key}.max`;
      return {
        kind: 'range',
        key: facet.key,
        title,
        icon,
        minName,
        maxName,
        minValue: queryNumber(params, minName),
        maxValue: queryNumber(params, maxName),
        minPlaceholder: String(facet.min ?? ''),
        maxPlaceholder: String(facet.max ?? ''),
      };
    }

    const selected = params
      .getAll(facet.key)
      .flatMap((value) => value.split(','))
      .filter(Boolean);
    const isBoolean = booleanFacetKeys.includes(facet.key);
    const options = facet.options.map((option) => {
      const label = isBoolean
        ? option.value === 'true'
          ? t('filters.yes')
          : option.value === 'false'
            ? t('filters.no')
            : option.label
        : option.label;
      return { value: option.value, label: `${label} (${option.count})` };
    });

    for (const value of selected) {
      if (!options.some((option) => option.value === value)) {
        options.unshift({ value, label: value });
      }
    }

    return {
      kind: 'options',
      key: facet.key,
      title,
      icon,
      control: facet.control === 'radio' ? 'radio' : 'checkbox',
      options,
      selected,
      visibleCount: facet.key === 'location' ? 6 : 8,
    };
  });

  return {
    facetModels,
    formKey: params.toString(),
  };
}

function queryNumber(params: URLSearchParams, name: string): number | '' {
  const value = Number(params.get(name));
  return Number.isFinite(value) && params.has(name) ? value : '';
}
