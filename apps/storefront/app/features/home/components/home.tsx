import type { PublicListingTypeResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { cn } from '@booking/ui/lib/utils';
import { Camera } from 'lucide-react';
import { PANEL_SURFACE } from '~/constants/surfaces';
import { useStudioHomeController } from '~/features/home/hooks/use-studio-home-controller';
import type { DiscoveryListingCardData } from '~/features/catalog/lib/listing-card.types';
import type { LocationOption } from '~/features/search/components/search-form';
import type { StorefrontTenant } from '~/lib/server/tenant.server';
import { BrandCarousel } from './brand-carousel';
import { StudioHero } from './hero';
import { NearbySection } from './nearby-section';
import { RecommendedSection } from './recommended-section';
import { TopListingsSection } from './top-listings-section';

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
  listings: DiscoveryListingCardData[];
  locations: LocationOption[];
}) {
  const { t } = useTranslation(NsI18n.Common);
  const {
    changeType,
    filterPending,
    hasVisibleListings,
    sections,
    selectedListingTypeName,
    selectedType,
  } = useStudioHomeController({ listingTypes, listings });

  return (
    <div className="bg-background">
      <StudioHero
        tenant={tenant}
        listingTypes={listingTypes}
        locations={locations}
        onTypeChange={changeType}
      />
      <div className="mx-auto flex max-w-292.5 flex-col gap-6 px-4 pb-12 sm:gap-12 sm:px-6 sm:pb-24 xl:px-0">
        <BrandCarousel
          images={(tenant.themeConfig.carousel ?? []).filter(Boolean)}
          tenantName={tenant.name}
        />
        {filterPending || hasVisibleListings ? (
          <>
            <TopListingsSection
              listings={sections.top}
              listingTypeName={selectedListingTypeName}
              listingTypeSlug={selectedType}
              pending={filterPending}
            />
            <NearbySection
              listingTypeSlug={selectedType}
              listingTypeName={selectedListingTypeName}
              pending={filterPending}
            />
            <RecommendedSection listings={sections.recommended} pending={filterPending} />
          </>
        ) : (
          <Empty className={cn(PANEL_SURFACE, 'bg-card p-(--sf-surface-pad) md:py-20')}>
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
