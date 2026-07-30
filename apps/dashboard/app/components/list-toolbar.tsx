import { Search } from 'lucide-react';
import { useEffect, useRef, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Form, Link, useSearchParams, useSubmit } from 'react-router';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { NativeSelect } from '@booking/ui/components/ui/native-select';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@booking/ui/components/ui/input-group';
import { cn } from '@booking/ui/lib/utils';
import type { FilterField, FilterSpec } from '~/lib/list-filters';
import { hasActiveFilters } from '~/lib/list-filters';

const SEARCH_DEBOUNCE_MS = 300;

type SearchField = Extract<FilterField, { kind: 'text' }>;

/**
 * URL-driven list toolbar. Renders one GET `<Form>`; each control auto-submits so
 * the loader re-runs (text debounced ~300ms via useSubmit, selects/dates immediate).
 * Because `page` is NOT a form field, any submit drops it -> resets to page 1; the
 * hidden `pageSize` input preserves page size. URL params the toolbar doesn't own
 * (e.g. a `status` set by an adjacent <StatusFilterTabs>) are re-emitted as hidden
 * inputs so submitting the search box doesn't wipe them. "Xoá lọc" links back to
 * `resetHref` (the area list index) to clear everything.
 */
export function ListToolbar({
  spec,
  filters,
  resetHref,
  pageSize,
  actions,
  customFilters,
  searchField,
  utilities,
  variant = 'default',
  layout = 'inline',
  className,
}: {
  spec: FilterSpec;
  filters: Record<string, string>;
  resetHref: string;
  pageSize: number;
  actions?: ReactNode;
  customFilters?: ReactNode;
  searchField?: SearchField;
  utilities?: ReactNode;
  variant?: 'default' | 'compact';
  layout?: 'inline' | 'split';
  className?: string;
}) {
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
      clearTimeout(debounce.current);
    };
  }, []);

  // Keys the toolbar controls own — everything else in the URL is preserved verbatim.
  const owned = new Set<string>(['page', 'pageSize']);
  const fields = searchField ? [searchField, ...spec] : spec;
  for (const field of fields) {
    if (field.kind === 'date-range') {
      owned.add(field.fromKey);
      owned.add(field.toKey);
    } else {
      owned.add(field.key);
    }
  }
  const preserved: [string, string][] = [];
  searchParams.forEach((value, key) => {
    if (!owned.has(key)) preserved.push([key, value]);
  });

  const submitForm = (form: HTMLFormElement) => {
    if (!isMounted.current || !form.isConnected) return;
    submit(form, { replace: true });
  };
  const onSearchInput = (event: FormEvent<HTMLInputElement>) => {
    const form = event.currentTarget.form;
    if (!form) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      debounce.current = undefined;
      submitForm(form);
    }, SEARCH_DEBOUNCE_MS);
  };
  const onControlChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.currentTarget.form) submitForm(event.currentTarget.form);
  };

  const searchFields = searchField
    ? [searchField]
    : spec.filter((field): field is SearchField => field.kind === 'text');
  const filterFields = searchField ? spec : spec.filter((field) => field.kind !== 'text');
  const activeFilters = hasActiveFilters(filters);

  const hiddenInputs = (
    <>
      <input type="hidden" name="pageSize" value={pageSize} />
      {preserved.map(([key, value], i) => (
        <input key={`preserved-${key}-${i}`} type="hidden" name={key} value={value} />
      ))}
    </>
  );

  if (layout === 'split') {
    const showPrimaryRow = searchFields.length > 0 || actions;
    const showFilterRow =
      filterFields.length > 0 || customFilters || utilities || activeFilters;

    return (
      <Form
        method="get"
        className={cn('flex min-w-0 w-full flex-col items-stretch gap-3', className)}
      >
        {hiddenInputs}
        {showPrimaryRow ? (
          <div className="flex min-w-0 w-full flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 w-full flex-col gap-3 sm:max-w-sm sm:flex-row">
              {searchFields.map((field) => (
                <ToolbarField
                  key={`${fieldKey(field)}:${fieldStateKey(field, filters)}`}
                  field={field}
                  filters={filters}
                  onSearchInput={onSearchInput}
                  onControlChange={onControlChange}
                  compact
                  split
                />
              ))}
            </div>
            {actions ? (
              <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}

        {showFilterRow ? (
          <div className="flex min-w-0 w-full flex-wrap items-center gap-3">
            {filterFields.map((field) => (
              <ToolbarField
                key={`${fieldKey(field)}:${fieldStateKey(field, filters)}`}
                field={field}
                filters={filters}
                onSearchInput={onSearchInput}
                onControlChange={onControlChange}
                compact={variant === 'compact'}
                split
              />
            ))}
            {customFilters}
            <noscript>
              <Button type="submit" variant="secondary">
                <Search className="size-4" /> Lọc
              </Button>
            </noscript>
            {activeFilters ? (
              <Button asChild variant="ghost">
                <Link to={resetHref}>Xoá lọc</Link>
              </Button>
            ) : null}
            {utilities ? (
              <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
                {utilities}
              </div>
            ) : null}
          </div>
        ) : null}
      </Form>
    );
  }

  return (
    <Form
      method="get"
      className={cn(
        'flex flex-wrap items-end gap-3',
        variant === 'compact' && 'w-full items-center lg:w-auto lg:justify-end',
        className,
      )}
    >
      {hiddenInputs}
      {fields.map((field) => (
        <ToolbarField
          key={`${fieldKey(field)}:${fieldStateKey(field, filters)}`}
          field={field}
          filters={filters}
          onSearchInput={onSearchInput}
          onControlChange={onControlChange}
          compact={variant === 'compact'}
        />
      ))}
      {customFilters}
      <noscript>
        <Button type="submit" variant="secondary">
          <Search className="size-4" /> Lọc
        </Button>
      </noscript>
      {activeFilters ? (
        <Button asChild variant="ghost">
          <Link to={resetHref}>Xoá lọc</Link>
        </Button>
      ) : null}
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
      {utilities ? <div className="flex flex-wrap items-center gap-2">{utilities}</div> : null}
    </Form>
  );
}

function fieldKey(field: FilterField): string {
  return field.kind === 'date-range' ? field.fromKey : field.key;
}

function fieldStateKey(field: FilterField, filters: Record<string, string>): string {
  return field.kind === 'date-range'
    ? `${filters[field.fromKey] ?? ''}:${filters[field.toKey] ?? ''}`
    : (filters[field.key] ?? '');
}

function ToolbarField({
  field,
  filters,
  onSearchInput,
  onControlChange,
  compact,
  split = false,
}: {
  field: FilterField;
  filters: Record<string, string>;
  onSearchInput: (e: FormEvent<HTMLInputElement>) => void;
  onControlChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  compact: boolean;
  split?: boolean;
}) {
  if (field.kind === 'text') {
    return (
      <div
        className={cn(
          'min-w-56 flex-1 space-y-1.5',
          compact && 'space-y-0 lg:w-64 lg:flex-none',
          split && 'w-full min-w-0 max-w-sm flex-none lg:w-full',
        )}
      >
        <Label htmlFor={field.key} className={compact ? 'sr-only' : undefined}>
          {field.label}
        </Label>
        {compact ? (
          <InputGroup>
            <InputGroupAddon>
              <Search aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              id={field.key}
              name={field.key}
              type="search"
              defaultValue={filters[field.key] ?? ''}
              placeholder={field.placeholder}
              onInput={onSearchInput}
            />
          </InputGroup>
        ) : (
          <Input
            id={field.key}
            name={field.key}
            type="search"
            defaultValue={filters[field.key] ?? ''}
            placeholder={field.placeholder}
            onInput={onSearchInput}
          />
        )}
      </div>
    );
  }
  if (field.kind === 'enum') {
    return (
      <div className={cn('space-y-1.5', compact && 'space-y-0', split && 'w-full sm:w-auto')}>
        <Label htmlFor={field.key} className={compact ? 'sr-only' : undefined}>
          {field.label}
        </Label>
        <NativeSelect
          id={field.key}
          name={field.key}
          defaultValue={filters[field.key] ?? ''}
          onChange={onControlChange}
          className={cn(compact && 'min-w-40', split && 'w-full sm:w-auto')}
        >
          <option value="">{field.allLabel ?? 'Tất cả'}</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
    );
  }
  return (
    <>
      <div className={cn('space-y-1.5', split && 'w-full sm:w-auto')}>
        <Label htmlFor={field.fromKey}>{field.label} từ</Label>
        <Input
          id={field.fromKey}
          name={field.fromKey}
          type="date"
          defaultValue={filters[field.fromKey] ?? ''}
          className={cn('w-auto', split && 'w-full sm:w-auto')}
          onChange={onControlChange}
        />
      </div>
      <div className={cn('space-y-1.5', split && 'w-full sm:w-auto')}>
        <Label htmlFor={field.toKey}>{field.label} đến</Label>
        <Input
          id={field.toKey}
          name={field.toKey}
          type="date"
          defaultValue={filters[field.toKey] ?? ''}
          className={cn('w-auto', split && 'w-full sm:w-auto')}
          onChange={onControlChange}
        />
      </div>
    </>
  );
}
