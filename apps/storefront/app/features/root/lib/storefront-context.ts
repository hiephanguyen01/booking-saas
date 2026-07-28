import type { CurrentUser, PublicListingTypeResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import type { AccountMenuSummary } from '~/features/account/lib/account-menu';
import type { StorefrontTenant } from '~/lib/server/tenant.server';

/** Shared route context exposed by the Storefront root outlet. */
export interface StorefrontContext {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  canonical: string;
  cspNonce: string;
  currentUser: CurrentUser | null;
  accountMenuSummary: AccountMenuSummary | null;
}
