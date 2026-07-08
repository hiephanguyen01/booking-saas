import { Form, Link, useSearchParams } from 'react-router';
import type { AttributeField, PublicListingResponse } from '@booking/shared';
import type { Route } from './+types/catalog';
import { fetchListings, fetchListingTypes } from '../lib/catalog.server';

export function meta({ params }: Route.MetaArgs) {
  return [{ title: params.typeSlug }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  // The public listings endpoint reads `type` + `attr.*` from the query string;
  // pin `type` to the route param and pass through any attr.* filters.
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
      <div className="mx-auto max-w-6xl px-6 py-16 text-center text-gray-500">
        Không tìm thấy loại “{params.typeSlug}”.
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 md:grid-cols-[240px_1fr]">
      <aside>
        <h1 className="mb-4 text-lg font-semibold text-(--sf-primary)">{type.name}</h1>
        <FilterForm fields={type.attributeSchema} searchParams={searchParams} />
      </aside>
      <section>
        <p className="mb-4 text-sm text-gray-500">{listings.length} kết quả</p>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The filter form is generated entirely from the type's filterable attributes. */
function FilterForm({
  fields,
  searchParams,
}: {
  fields: AttributeField[];
  searchParams: URLSearchParams;
}) {
  if (fields.length === 0) {
    return <p className="text-sm text-gray-500">Không có bộ lọc.</p>;
  }
  return (
    <Form method="get" className="space-y-4">
      {fields.map((field) => (
        <FilterField key={field.key} field={field} value={searchParams.get(`attr.${field.key}`) ?? ''} />
      ))}
      <div className="flex gap-2">
        <button type="submit" className="rounded-md bg-(--sf-primary) px-3 py-2 text-sm text-white">
          Lọc
        </button>
        <a href="?" className="rounded-md border border-black/15 px-3 py-2 text-sm">
          Xóa
        </a>
      </div>
    </Form>
  );
}

function FilterField({ field, value }: { field: AttributeField; value: string }) {
  const name = `attr.${field.key}`;
  const inputClass = 'w-full rounded-md border border-black/15 px-2 py-1 text-sm';
  let control: React.ReactNode;

  switch (field.type) {
    case 'select':
    case 'multiselect':
      control = (
        <select name={name} defaultValue={value} className={inputClass}>
          <option value="">Tất cả</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
      break;
    case 'boolean':
      control = (
        <select name={name} defaultValue={value} className={inputClass}>
          <option value="">Tất cả</option>
          <option value="true">Có</option>
          <option value="false">Không</option>
        </select>
      );
      break;
    case 'number':
      control = <input type="number" name={name} defaultValue={value} className={inputClass} />;
      break;
    default:
      control = <input type="text" name={name} defaultValue={value} className={inputClass} />;
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{field.label}</label>
      {control}
    </div>
  );
}

function ListingCard({ listing }: { listing: PublicListingResponse }) {
  return (
    <li className="rounded-lg border border-black/10 p-4">
      <h3 className="font-medium">
        <Link to={`/l/${listing.slug}`} className="hover:text-(--sf-accent)">
          {listing.title}
        </Link>
      </h3>
      {listing.priceFrom ? (
        <p className="mt-1 text-sm text-(--sf-accent)">
          từ {Number(listing.priceFrom).toLocaleString('vi-VN')}₫
        </p>
      ) : null}
      <dl className="mt-2 flex flex-wrap gap-x-3 text-xs text-gray-500">
        {Object.entries(listing.attributes).map(([key, val]) => (
          <span key={key}>
            {key}: {String(val)}
          </span>
        ))}
      </dl>
    </li>
  );
}
