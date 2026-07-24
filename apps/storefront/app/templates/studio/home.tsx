import type { PublicListingResponse, PublicListingTypeResponse } from '@booking/contracts';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { Camera } from 'lucide-react';
import type { LocationOption } from '../../features/search/search-form';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { StorefrontTenant } from '../../lib/tenant.server';
import { BrandCarousel } from './brand-carousel';
import { StudioHero } from './hero';
import { RecommendedSection } from './recommended-section';
import { TopListingsSection } from './top-listings-section';
import { useStudioHomeController } from './use-studio-home-controller';

/**
 * Studio-vertical home (§16.1): hero + search, a lead rail, and a flat
 * "recommended" grid — generated from the tenant's data. Both rails derive from
 * the same already-loaded `listings` array (no extra fetch).
 */
export function StudioHome({
  tenant,
  listingTypes,
  listings,
  locations,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  listings: PublicListingResponse[];
  locations: LocationOption[];
}) {
  const { t } = useTranslation(NsI18n.Common);
  const { changeType, filterPending, hasVisibleListings, sections, selectedListingTypeName } =
    useStudioHomeController({ listingTypes, listings });

  return (
    <div className="bg-background">
      <StudioHero
        tenant={tenant}
        listingTypes={listingTypes}
        locations={locations}
        onTypeChange={changeType}
      />
      <div className="mx-auto flex max-w-292.5 flex-col gap-10 px-4 pb-24 sm:px-6 xl:px-0">
        <BrandCarousel
          images={(tenant.themeConfig.carousel ?? []).filter(Boolean)}
          tenantName={tenant.name}
        />
        {filterPending || hasVisibleListings ? (
          <>
            <TopListingsSection
              listings={sections.top}
              listingTypeName={selectedListingTypeName}
              pending={filterPending}
            />
            <RecommendedSection listings={sections.recommended} pending={filterPending} />
          </>
        ) : (
          <Empty className="border border-border bg-card py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Camera aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t('home.emptyTitle')}</EmptyTitle>
              <EmptyDescription>{t('home.emptyBody')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
}
