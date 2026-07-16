import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import type { StorefrontContext } from '../root';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { storefrontPaths } from '../lib/locale-paths';
import { typeIcon } from '../lib/ui';

type AccountFlowLayoutProps = {
  children: ReactNode;
  context: StorefrontContext;
  section: ReactNode;
  contentClassName?: string;
  contentAs?: 'div' | 'main';
  showCategories?: boolean;
};

export function AccountFlowLayout({
  children,
  context,
  section,
  contentClassName,
  contentAs = 'main',
  showCategories = false,
}: AccountFlowLayoutProps) {
  const Content = contentAs;

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <SiteHeader
        tenant={context.tenant}
        listingTypes={context.listingTypes}
        locale={context.locale}
        currentUser={context.currentUser}
      />
      {showCategories && context.listingTypes.length ? (
        <nav aria-label="Danh mục" className="bg-[#12131a] text-white">
          <div className="mx-auto flex h-14 max-w-292.5 items-center gap-1 overflow-x-auto px-4 sm:px-6 xl:px-0">
            {context.listingTypes.map((type, index) => {
              const Icon = typeIcon(type.slug);
              return (
                <NavLink
                  key={type.id}
                  to={storefrontPaths.catalog(context.locale, type.slug)}
                  className={({ isActive }) =>
                    `inline-flex h-9 shrink-0 items-center gap-2 rounded-sm px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                      isActive || index === 0
                        ? 'bg-white/12 text-white'
                        : 'text-white/65 hover:bg-white/8 hover:text-white'
                    }`
                  }
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {type.name}
                </NavLink>
              );
            })}
          </div>
        </nav>
      ) : null}
      <span className="sr-only">{section}</span>
      <Content className={contentClassName}>{children}</Content>
      <SiteFooter tenant={context.tenant} className="mt-0" />
    </div>
  );
}
