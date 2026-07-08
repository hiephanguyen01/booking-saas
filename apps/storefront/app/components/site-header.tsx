import { Link, NavLink } from 'react-router';
import { Globe, LayoutGrid, type LucideIcon } from 'lucide-react';
import type { PublicListingTypeResponse } from '@booking/shared';
import { cn } from '@booking/ui/lib/utils';
import type { StorefrontTenant } from '../lib/tenant.server';
import { typeIcon } from '../lib/ui';

/** Storefront navigation — logo + a category bar auto-generated from listing types. */
export function SiteHeader({
  tenant,
  listingTypes,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-(--sf-background)/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link to="/" className="text-xl font-extrabold tracking-tight text-(--sf-primary)">
            {tenant.name}
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-black/10 px-3 py-1.5 text-sm text-(--sf-muted) sm:flex">
            <Globe className="size-4" />
            VND · VI
          </div>
        </div>
        <nav className="-mx-1 flex items-center gap-1 overflow-x-auto pb-3">
          <CategoryLink to="/" label="Tất cả" icon={LayoutGrid} end />
          {listingTypes.map((type) => (
            <CategoryLink key={type.id} to={`/t/${type.slug}`} label={type.name} icon={typeIcon(type.slug)} />
          ))}
        </nav>
      </div>
    </header>
  );
}

function CategoryLink({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-(--sf-primary)/10 text-gray-900'
            : 'text-gray-600 hover:bg-black/5',
        )
      }
    >
      <Icon className="size-4" />
      {label}
    </NavLink>
  );
}
