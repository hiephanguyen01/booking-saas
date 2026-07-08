import { Link } from 'react-router';
import type { PublicListingTypeResponse } from '@booking/shared';
import type { StorefrontTenant } from '../lib/tenant.server';

/** Storefront navigation — auto-generated from the tenant's active listing types. */
export function SiteHeader({
  tenant,
  listingTypes,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
}) {
  return (
    <header className="border-b border-black/10">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
        <Link to="/" className="text-lg font-bold text-(--sf-primary)">
          {tenant.name}
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link to="/" className="hover:text-(--sf-accent)">
            Trang chủ
          </Link>
          {listingTypes.map((type) => (
            <Link key={type.id} to={`/t/${type.slug}`} className="hover:text-(--sf-accent)">
              {type.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
