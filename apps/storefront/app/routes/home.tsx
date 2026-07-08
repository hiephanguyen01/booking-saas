import { Link, useOutletContext } from 'react-router';
import type { PublicListingTypeResponse } from '@booking/shared';
import type { Route } from './+types/home';
import type { StorefrontContext } from '../root';
import { fetchListings } from '../lib/catalog.server';
import { ListingCard } from '../components/listing-card';
import { typeIcon } from '../lib/ui';
import type { StorefrontTenant } from '../lib/tenant.server';

export async function loader({ request }: Route.LoaderArgs) {
  const listings = await fetchListings(request, new URLSearchParams());
  return { listings };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { tenant, listingTypes } = useOutletContext<StorefrontContext>();
  const { listings } = loaderData;

  return (
    <>
      <Hero tenant={tenant} listingTypes={listingTypes} />
      <div className="mx-auto max-w-7xl space-y-14 px-6 py-14">
        {listingTypes.map((type) => {
          const items = listings.filter((l) => l.listingTypeSlug === type.slug);
          if (items.length === 0) return null;
          return (
            <section key={type.id}>
              <div className="mb-5 flex items-end justify-between">
                <h2 className="text-2xl font-bold tracking-tight">{type.name}</h2>
                <Link
                  to={`/t/${type.slug}`}
                  className="text-sm font-semibold text-gray-900 underline-offset-4 hover:underline"
                >
                  Xem tất cả
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
                {items.slice(0, 4).map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function Hero({
  tenant,
  listingTypes,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
}) {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-6">
      <div className="relative overflow-hidden rounded-3xl bg-gray-900">
        <img
          src={`https://picsum.photos/seed/${tenant.slug}-hero/1600/700`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/25 to-transparent" />
        <div className="relative flex min-h-[320px] flex-col justify-end gap-4 p-8 md:min-h-[400px] md:p-12">
          <h1 className="max-w-2xl text-3xl font-extrabold leading-tight text-white md:text-5xl">
            Đặt {tenant.name} chỉ trong vài phút
          </h1>
          <p className="max-w-xl text-white/85">
            Studio, thiết bị và dịch vụ chuyên nghiệp — chọn khung giờ, xem giá ngay.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {listingTypes.slice(0, 5).map((type) => {
              const Icon = typeIcon(type.slug);
              return (
                <Link
                  key={type.id}
                  to={`/t/${type.slug}`}
                  className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-white"
                >
                  <Icon className="size-4" />
                  {type.name}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
