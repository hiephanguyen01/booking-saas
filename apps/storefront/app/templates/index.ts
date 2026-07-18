import type { PublicListingResponse, PublicListingTypeResponse } from '@booking/contracts';
import type { LocationOption } from '../features/search/search-form';
import type { StorefrontTenant } from '../lib/tenant.server';
import { StudioHome } from './studio/home';

/**
 * Vertical → home template (§16.1). `tenants.vertical` selects the base layout.
 * Only `studio` ships in Phase 1; `rental`/`classes` fall back to it until their
 * templates land (Phase 2/3).
 */
export interface HomeTemplateProps {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  listings: PublicListingResponse[];
  locations: LocationOption[];
}

export function homeTemplateFor(
  _vertical: StorefrontTenant['vertical'],
): (props: HomeTemplateProps) => React.ReactNode {
  return StudioHome;
}
