import { Link, useOutletContext } from 'react-router';
import type { StorefrontContext } from '../root';
import { StudioHero } from '../templates/studio/hero';

export default function Home() {
  const { tenant, listingTypes } = useOutletContext<StorefrontContext>();
  return (
    <>
      <StudioHero tenant={tenant} />
      <div className="mx-auto max-w-6xl px-6 pb-24">
        {listingTypes.map((type) => (
          <section key={type.id} className="flex items-center justify-between border-t border-black/10 py-8">
            <h2 className="text-xl font-semibold text-(--sf-primary)">{type.name}</h2>
            <Link to={`/t/${type.slug}`} className="text-sm text-(--sf-accent) hover:underline">
              Xem tất cả →
            </Link>
          </section>
        ))}
      </div>
    </>
  );
}
