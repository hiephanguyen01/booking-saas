import type { AttributeField } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@booking/ui/components/ui/native-select';
import { Form, useSearchParams } from 'react-router';
import { NsI18n, type ScopedI18n, useTranslation } from '../../lib/i18n';
import { typeIcon } from '../../lib/ui';
import type { Route } from '../../routes/+types/catalog';
import { ListingCard } from './components/listing-card';

export function CatalogPage({ loaderData, params }: Route.ComponentProps) {
  const { type, listings } = loaderData;
  const [searchParams] = useSearchParams();
  const i18n = useTranslation(NsI18n.Catalog);
  const { t } = i18n;

  if (!type) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-24 text-center text-muted-foreground">
        {t('typeNotFound', { slug: params.typeSlug })}
      </div>
    );
  }

  const Icon = typeIcon(type.slug);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{type.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t('resultsCount', { count: listings.length })}
          </p>
        </div>
      </div>

      {type.attributeSchema.length > 0 ? (
        <FilterBar fields={type.attributeSchema} searchParams={searchParams} i18n={i18n} />
      ) : null}

      {listings.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBar({
  fields,
  searchParams,
  i18n,
}: {
  fields: AttributeField[];
  searchParams: URLSearchParams;
  i18n: ScopedI18n<NsI18n.Catalog>;
}) {
  const { t } = i18n;
  return (
    <Form
      method="get"
      className="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      {fields.map((field) => (
        <FilterField
          key={field.key}
          field={field}
          value={searchParams.get(`attr.${field.key}`) ?? ''}
          i18n={i18n}
        />
      ))}
      <div className="ml-auto flex gap-2">
        <Button type="submit" size="sm">
          {t('filter')}
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href="?">{t('clear')}</a>
        </Button>
      </div>
    </Form>
  );
}

function FilterField({
  field,
  value,
  i18n,
}: {
  field: AttributeField;
  value: string;
  i18n: ScopedI18n<NsI18n.Catalog>;
}) {
  const { t } = i18n;
  const name = `attr.${field.key}`;
  let control: React.ReactNode;

  switch (field.type) {
    case 'select':
    case 'multiselect':
      control = (
        <NativeSelect name={name} defaultValue={value} size="sm">
          <NativeSelectOption value="">{t('allOption')}</NativeSelectOption>
          {(field.options ?? []).map((option) => (
            <NativeSelectOption key={option} value={option}>
              {option}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      );
      break;
    case 'boolean':
      control = (
        <NativeSelect name={name} defaultValue={value} size="sm">
          <NativeSelectOption value="">{t('allOption')}</NativeSelectOption>
          <NativeSelectOption value="true">{t('yes')}</NativeSelectOption>
          <NativeSelectOption value="false">{t('no')}</NativeSelectOption>
        </NativeSelect>
      );
      break;
    case 'number':
      control = <Input type="number" name={name} defaultValue={value} className="h-8 w-28" />;
      break;
    default:
      control = <Input type="text" name={name} defaultValue={value} className="h-8 w-44" />;
  }

  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-muted-foreground">{field.label}</span>
      {control}
    </label>
  );
}
