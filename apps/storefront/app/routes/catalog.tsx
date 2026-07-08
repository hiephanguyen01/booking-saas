import { Form, useSearchParams } from 'react-router';
import type { AttributeField } from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@booking/ui/components/ui/native-select';
import type { Route } from './+types/catalog';
import { fetchListings, fetchListingTypes } from '../lib/catalog.server';
import { ListingCard } from '../components/listing-card';
import { typeIcon } from '../lib/ui';

export function meta({ params }: Route.MetaArgs) {
  return [{ title: params.typeSlug }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const search = new URLSearchParams(new URL(request.url).search);
  search.set('type', params.typeSlug);

  const [types, listings] = await Promise.all([
    fetchListingTypes(request),
    fetchListings(request, search),
  ]);
  const type = types.find((t) => t.slug === params.typeSlug) ?? null;
  return { type, listings };
}

export default function Catalog({ loaderData, params }: Route.ComponentProps) {
  const { type, listings } = loaderData;
  const [searchParams] = useSearchParams();

  if (!type) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-24 text-center text-gray-500">
        Không tìm thấy loại “{params.typeSlug}”.
      </div>
    );
  }

  const Icon = typeIcon(type.slug);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-(--sf-primary)/10 text-(--sf-primary)">
          <Icon className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{type.name}</h1>
          <p className="text-sm text-(--sf-muted)">{listings.length} kết quả</p>
        </div>
      </div>

      {type.attributeSchema.length > 0 ? (
        <FilterBar fields={type.attributeSchema} searchParams={searchParams} />
      ) : null}

      {listings.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-black/10 py-16 text-center text-(--sf-muted)">
          Không có kết quả phù hợp bộ lọc.
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
}: {
  fields: AttributeField[];
  searchParams: URLSearchParams;
}) {
  return (
    <Form
      method="get"
      className="flex flex-wrap items-end gap-4 rounded-2xl border border-black/10 bg-white p-4 shadow-sm"
    >
      {fields.map((field) => (
        <FilterField key={field.key} field={field} value={searchParams.get(`attr.${field.key}`) ?? ''} />
      ))}
      <div className="ml-auto flex gap-2">
        <Button type="submit" size="sm">
          Lọc
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href="?">Xóa</a>
        </Button>
      </div>
    </Form>
  );
}

function FilterField({ field, value }: { field: AttributeField; value: string }) {
  const name = `attr.${field.key}`;
  let control: React.ReactNode;

  switch (field.type) {
    case 'select':
    case 'multiselect':
      control = (
        <NativeSelect name={name} defaultValue={value} size="sm">
          <NativeSelectOption value="">Tất cả</NativeSelectOption>
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
          <NativeSelectOption value="">Tất cả</NativeSelectOption>
          <NativeSelectOption value="true">Có</NativeSelectOption>
          <NativeSelectOption value="false">Không</NativeSelectOption>
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
      <span className="font-medium text-gray-700">{field.label}</span>
      {control}
    </label>
  );
}
