import { Search } from 'lucide-react';
import { useRef, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Form, Link, useSubmit } from 'react-router';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { NativeSelect } from '@booking/ui/components/ui/native-select';
import type { FilterField, FilterSpec } from '~/lib/list-filters';
import { hasActiveFilters } from '~/lib/list-filters';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * URL-driven list toolbar. Renders one GET `<Form>`; each control auto-submits so
 * the loader re-runs (text debounced ~300ms via useSubmit, selects/dates immediate).
 * Because `page` is NOT a form field, any submit drops it -> resets to page 1; the
 * hidden `pageSize` input preserves page size. "Xoá lọc" links back to `resetHref`
 * (the area list index) to clear everything. Single-table pages only — a Form submit
 * drops unrelated params (namespaced sub-table pages should keep their bespoke wiring).
 */
export function ListToolbar({
  spec,
  filters,
  resetHref,
  pageSize,
  actions,
}: {
  spec: FilterSpec;
  filters: Record<string, string>;
  resetHref: string;
  pageSize: number;
  actions?: ReactNode;
}) {
  const submit = useSubmit();
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const submitForm = (form: HTMLFormElement) => submit(form, { replace: true });
  const onSearchInput = (event: FormEvent<HTMLInputElement>) => {
    const form = event.currentTarget.form;
    if (!form) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => submitForm(form), SEARCH_DEBOUNCE_MS);
  };
  const onControlChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.currentTarget.form) submitForm(event.currentTarget.form);
  };

  return (
    <Form method="get" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="pageSize" value={pageSize} />
      {spec.map((field) => (
        <ToolbarField
          key={fieldKey(field)}
          field={field}
          filters={filters}
          onSearchInput={onSearchInput}
          onControlChange={onControlChange}
        />
      ))}
      <noscript>
        <Button type="submit" variant="secondary">
          <Search className="size-4" /> Lọc
        </Button>
      </noscript>
      {hasActiveFilters(filters) ? (
        <Button asChild variant="ghost">
          <Link to={resetHref}>Xoá lọc</Link>
        </Button>
      ) : null}
      {actions ? <div className="ml-auto">{actions}</div> : null}
    </Form>
  );
}

function fieldKey(field: FilterField): string {
  return field.kind === 'date-range' ? field.fromKey : field.key;
}

function ToolbarField({
  field,
  filters,
  onSearchInput,
  onControlChange,
}: {
  field: FilterField;
  filters: Record<string, string>;
  onSearchInput: (e: FormEvent<HTMLInputElement>) => void;
  onControlChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}) {
  if (field.kind === 'text') {
    return (
      <div className="min-w-56 flex-1 space-y-1.5">
        <Label htmlFor={field.key}>{field.label}</Label>
        <Input
          id={field.key}
          name={field.key}
          type="search"
          defaultValue={filters[field.key] ?? ''}
          placeholder={field.placeholder}
          onInput={onSearchInput}
        />
      </div>
    );
  }
  if (field.kind === 'enum') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={field.key}>{field.label}</Label>
        <NativeSelect
          id={field.key}
          name={field.key}
          defaultValue={filters[field.key] ?? ''}
          onChange={onControlChange}
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
      <div className="space-y-1.5">
        <Label htmlFor={field.fromKey}>{field.label} từ</Label>
        <Input
          id={field.fromKey}
          name={field.fromKey}
          type="date"
          defaultValue={filters[field.fromKey] ?? ''}
          className="w-auto"
          onChange={onControlChange}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={field.toKey}>{field.label} đến</Label>
        <Input
          id={field.toKey}
          name={field.toKey}
          type="date"
          defaultValue={filters[field.toKey] ?? ''}
          className="w-auto"
          onChange={onControlChange}
        />
      </div>
    </>
  );
}
