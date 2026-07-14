/**
 * SiteLayout — the primary storefront shell.
 *
 * Wraps the page content with SiteHeader + SiteFooter.
 * Used in root.tsx when `isStandalone` is false.
 *
 * Extracted so future changes to the outer shell are isolated to one file.
 */

import type { PublicListingTypeResponse } from '@booking/contracts';
import { Outlet } from 'react-router';
import type { Locale } from '../lib/i18n';
import type { StorefrontTenant } from '../lib/tenant.server';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

interface SiteLayoutProps {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  context: Record<string, unknown>;
}

export function SiteLayout({ tenant, listingTypes, locale, context }: SiteLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-(--sf-background) text-foreground">
      <SiteHeader tenant={tenant} listingTypes={listingTypes} locale={locale} />
      <main className="flex-1">
        <Outlet context={context} />
      </main>
      <SiteFooter tenant={tenant} />
    </div>
  );
}
