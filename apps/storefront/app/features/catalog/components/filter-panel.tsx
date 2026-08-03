import type { PublicCatalogFacet } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@booking/ui/components/ui/collapsible';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@booking/ui/components/ui/input-group';
import { RadioGroup, RadioGroupItem } from '@booking/ui/components/ui/radio-group';
import { ChevronDown, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { Form, Link } from 'react-router';
import { LucideByName } from '~/components/lucide-by-name';
import { NsI18n, useTranslation } from '@booking/i18n';
import { scheduleParams, type StorefrontSearchState } from '~/features/search/lib/search-state';
import {
  type FilterOption,
  useFilterPanelController,
} from '~/features/catalog/hooks/use-filter-panel-controller';

/**
 * The catalog sidebar filters.
 *
 * Every option comes from facets derived from the current category and schedule
 * context, before the active checkbox filters are applied. The panel used to be
 * built on a hand-written mock catalogue (invented
 * locations, two amenity lists and "(132)" counts rendered as if they were real)
 * whose location values were slugs — `containsLocation()` substring-matches the
 * listing's address text, so a slug never matched and any location filter
 * returned nothing.
 */
export function FilterPanel({
  state,
  facets,
  booleanFacetKeys = [],
}: {
  state: StorefrontSearchState;
  facets: PublicCatalogFacet[];
  booleanFacetKeys?: string[];
}) {
  const { t } = useTranslation(NsI18n.Catalog);
  const { facetModels, formKey } = useFilterPanelController({ facets, booleanFacetKeys });

  return (
    <Form key={formKey} method="get" className="flex flex-col gap-6">
      <input type="hidden" name="q" value={state.q} />
      {state.mode !== 'none' ? <input type="hidden" name="mode" value={state.mode} /> : null}
      <input type="hidden" name="guests" value={state.guests} />
      {state.mode === 'inventory' ? (
        <input type="hidden" name="quantity" value={state.quantity} />
      ) : null}
      {state.sort !== 'relevance' ? <input type="hidden" name="sort" value={state.sort} /> : null}
      {/* `location` is deliberately absent: the panel renders it as a real facet control. */}
      {scheduleParams(state).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <h2 className="text-base font-semibold uppercase text-foreground">{t('filters.title')}</h2>

      <FilterSection title={t('filters.rating')}>
        <RadioGroup
          name="minRating"
          defaultValue={state.minRating === null ? '' : String(state.minRating)}
          className="gap-3"
        >
          <OptionLabel>
            <RadioGroupItem value="" />
            <span>{t('filters.allRatings')}</span>
          </OptionLabel>
          {[4.5, 4, 3].map((rating) => (
            <OptionLabel key={rating}>
              <RadioGroupItem value={String(rating)} />
              <span className="flex items-center gap-1.5">
                <Star className="size-4 text-warning" fill="currentColor" aria-hidden="true" />
                <span>{t('filters.ratingAtLeast', { rating })}</span>
              </span>
            </OptionLabel>
          ))}
        </RadioGroup>
      </FilterSection>

      {facetModels.map((facet) => {
        if (facet.kind === 'price') {
          return (
            <FilterSection key={facet.key} title={facet.title} icon={facet.icon}>
              <div className="flex items-center gap-2">
                <PriceInput name="minPrice" value={state.minPrice} label={t('filters.minPrice')} />
                <span aria-hidden="true">–</span>
                <PriceInput name="maxPrice" value={state.maxPrice} label={t('filters.maxPrice')} />
              </div>
            </FilterSection>
          );
        }

        if (facet.kind === 'range') {
          return (
            <FilterSection key={facet.key} title={facet.title} icon={facet.icon}>
              <div className="flex items-center gap-2">
                <input
                  aria-label={`${facet.title}: ${t('filters.minimum')}`}
                  className="h-10 min-w-0 rounded-md border px-3 text-sm"
                  name={facet.minName}
                  type="number"
                  defaultValue={facet.minValue}
                  placeholder={facet.minPlaceholder}
                />
                <span aria-hidden="true">–</span>
                <input
                  aria-label={`${facet.title}: ${t('filters.maximum')}`}
                  className="h-10 min-w-0 rounded-md border px-3 text-sm"
                  name={facet.maxName}
                  type="number"
                  defaultValue={facet.maxValue}
                  placeholder={facet.maxPlaceholder}
                />
              </div>
            </FilterSection>
          );
        }

        return (
          <FilterSection key={facet.key} title={facet.title} icon={facet.icon}>
            {facet.control === 'radio' ? (
              <FilterRadioList
                name={facet.key}
                options={facet.options}
                selected={facet.selected[0] ?? ''}
                allLabel={t('filters.all')}
                visibleCount={facet.visibleCount}
              />
            ) : (
              <FilterCheckList
                name={facet.key}
                options={facet.options}
                selected={facet.selected}
                visibleCount={facet.visibleCount}
              />
            )}
          </FilterSection>
        );
      })}

      <div className="sticky bottom-0 grid grid-cols-2 gap-2 bg-background/95 py-3 backdrop-blur-sm">
        <Button asChild variant="ghost">
          <Link to="?">{t('filters.clearAll')}</Link>
        </Button>
        <Button type="submit">{t('filters.apply')}</Button>
      </div>
    </Form>
  );
}

function PriceInput({ name, value, label }: { name: string; value: number | null; label: string }) {
  return (
    <InputGroup className="bg-background shadow-none">
      <InputGroupInput
        name={name}
        // Empty unless the URL carries the bound: a pre-filled default submits as
        // a real filter, silently restricting results the user never narrowed.
        defaultValue={value === null ? '' : new Intl.NumberFormat('vi-VN').format(value)}
        inputMode="numeric"
        aria-label={label}
        placeholder={label}
      />
      <InputGroupAddon align="inline-end" className="pr-3 font-normal">
        đ
      </InputGroupAddon>
    </InputGroup>
  );
}

/**
 * Radix unmounts collapsed `CollapsibleContent`, and an unmounted control submits
 * nothing — so an active option hidden in the overflow would be dropped the next
 * time the panel is applied. Keeping the selected options in the visible slice
 * is what makes the overflow safe.
 */
function selectedFirst(
  options: FilterOption[],
  isSelected: (option: FilterOption) => boolean,
  visibleCount: number,
): { visible: FilterOption[]; hidden: FilterOption[] } {
  const active = options.filter(isSelected);
  const rest = options.filter((option) => !isSelected(option));
  const ordered = [...active, ...rest];
  const cut = Math.max(visibleCount, active.length);
  return { visible: ordered.slice(0, cut), hidden: ordered.slice(cut) };
}

/** The overflow-aware option list both control kinds render; only the leaf differs. */
function FilterOptionList({
  options,
  isSelected,
  visibleCount,
  renderOption,
  wrap,
}: {
  options: FilterOption[];
  isSelected: (option: FilterOption) => boolean;
  visibleCount: number;
  renderOption: (option: FilterOption) => ReactNode;
  wrap: (children: ReactNode) => ReactNode;
}) {
  const { visible, hidden } = selectedFirst(options, isSelected, visibleCount);

  return (
    <Collapsible>
      {wrap(
        <>
          {visible.map(renderOption)}
          {hidden.length ? (
            <CollapsibleContent className="flex flex-col gap-3">
              {hidden.map(renderOption)}
            </CollapsibleContent>
          ) : null}
        </>,
      )}
      {hidden.length ? <ShowMoreTrigger /> : null}
    </Collapsible>
  );
}

function FilterRadioList({
  name,
  options,
  selected,
  allLabel,
  visibleCount = options.length,
}: {
  name: string;
  options: FilterOption[];
  /** Single-valued: the loader reads one `?{name}=` per request. */
  selected: string;
  allLabel: string;
  visibleCount?: number;
}) {
  return (
    <FilterOptionList
      options={options}
      isSelected={(option) => option.value === selected}
      visibleCount={visibleCount}
      renderOption={(option) => (
        <OptionLabel key={option.value}>
          <RadioGroupItem value={option.value} />
          <span>{option.label}</span>
        </OptionLabel>
      )}
      wrap={(children) => (
        <RadioGroup name={name} defaultValue={selected} className="gap-3">
          <OptionLabel>
            <RadioGroupItem value="" />
            <span>{allLabel}</span>
          </OptionLabel>
          {children}
        </RadioGroup>
      )}
    />
  );
}

function FilterCheckList({
  name,
  options,
  selected,
  visibleCount = options.length,
}: {
  name: string;
  options: FilterOption[];
  selected: string[];
  visibleCount?: number;
}) {
  // One Set for all three membership passes: ordering, rendering, and the guard above.
  const selectedValues = new Set(selected);

  return (
    <FilterOptionList
      options={options}
      isSelected={(option) => selectedValues.has(option.value)}
      visibleCount={visibleCount}
      renderOption={(option) => (
        <OptionLabel key={option.value}>
          <Checkbox
            name={name}
            value={option.value}
            defaultChecked={selectedValues.has(option.value)}
            className="size-4 rounded-xs"
          />
          <span>{option.label}</span>
        </OptionLabel>
      )}
      wrap={(children) => <div className="flex flex-col gap-3">{children}</div>}
    />
  );
}

function ShowMoreTrigger() {
  const { t } = useTranslation(NsI18n.Catalog);
  return (
    <CollapsibleTrigger className="group mt-3 flex w-fit items-center gap-1 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
      <span className="group-data-[state=open]:hidden">{t('filters.showMore')}</span>
      <span className="hidden group-data-[state=open]:inline">{t('filters.showLess')}</span>
      <ChevronDown
        className="size-4 transition-transform group-data-[state=open]:rotate-180"
        aria-hidden="true"
      />
    </CollapsibleTrigger>
  );
}

function OptionLabel({ children }: { children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm leading-5 text-foreground">
      {children}
    </label>
  );
}

function FilterSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: string | null;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        {icon ? <LucideByName name={icon} className="size-4 text-muted-foreground" /> : null}
        {title}
      </legend>
      {children}
    </fieldset>
  );
}
