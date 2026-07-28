import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import type { StorefrontContext } from '~/root';
import { SiteFooter } from '~/features/site-shell/components/site-footer';
import { SiteHeader } from '~/features/site-shell/components/site-header';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { ListingTypeGlyph } from '~/components/listing-type-glyph';

type AccountFlowLayoutProps = {
  children: ReactNode;
  context: StorefrontContext;
  /** Names the `<main>` landmark, so screen readers can tell the flows apart. */
  section: string;
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
      {showCategories && context.listingTypes.length ? <CategoryNav context={context} /> : null}
      {/* When the flow renders its own <main>, there is no landmark here to name. */}
      <Content className={contentClassName} aria-label={contentAs === 'main' ? section : undefined}>
        {children}
      </Content>
      <SiteFooter tenant={context.tenant} className="mt-0" />
    </div>
  );
}

/**
 * Inverted bar: `foreground`/`background` are the tenant's own canvas pair, so it
 * stays a high-contrast band whichever way the tenant theme leans.
 */
function CategoryNav({ context }: { context: StorefrontContext }) {
  const { t } = useTranslation(NsI18n.Navigation);

  return (
    <nav aria-label={t('categories')} className="bg-foreground text-background">
      <div className="mx-auto flex h-14 max-w-292.5 items-center gap-1 overflow-x-auto px-4 sm:px-6 xl:px-0">
        {context.listingTypes.map((type) => (
          <NavLink
            key={type.id}
            to={storefrontPaths.catalog(context.locale, type.slug)}
            className={({ isActive }) =>
              `inline-flex h-9 shrink-0 items-center gap-2 rounded-sm px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background ${
                isActive
                  ? 'bg-background/15 text-background'
                  : 'text-background/70 hover:bg-background/10 hover:text-background'
              }`
            }
          >
            <ListingTypeGlyph type={type} className="size-4" />
            {type.name}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
