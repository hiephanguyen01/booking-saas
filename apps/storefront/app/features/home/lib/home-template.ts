import type { PublicListingResponse, PublicListingTypeResponse } from '@booking/contracts';
import type { LocationOption } from '~/features/search/components/search-form';
import type { StorefrontTenant } from '~/lib/tenant.server';
import { StudioHome } from '~/features/home/components/home';

/**
 * Vertical → home template (§16.1). `tenants.vertical` chọn layout gốc.
 * Phase 1 chỉ có `studio`; các vertical khác fallback về nó cho tới khi có template riêng.
 */
export interface HomeTemplateProps {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  listings: PublicListingResponse[];
  locations: LocationOption[];
}

export function homeTemplateFor(
  vertical: StorefrontTenant['vertical'],
): (props: HomeTemplateProps) => React.ReactNode {
  switch (vertical) {
    case 'studio':
    default:
      return StudioHome;
  }
}
