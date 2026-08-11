import type { ReactNode } from 'react';
import { DiscoveryListingTrack } from '~/components/discovery-listing-track';
import { SectionHeading } from '~/components/section-heading';
import type { DiscoveryListingCardData } from '~/features/catalog/lib/listing-card.types';

export function HomeDiscoverySectionHeading({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <SectionHeading
      title={title}
      action={action}
      className="bg-card"
    />
  );
}

/** Shared Figma-aligned listing rail for the home discovery sections. */
export function HomeListingRail({
  title,
  items,
  action,
  previousLabel,
  nextLabel,
}: {
  title: string;
  items: DiscoveryListingCardData[];
  action?: ReactNode;
  previousLabel: string;
  nextLabel: string;
}) {
  return (
    <section>
      <HomeDiscoverySectionHeading title={title} action={action} />
      <DiscoveryListingTrack
        items={items}
        ariaLabel={title}
        previousLabel={previousLabel}
        nextLabel={nextLabel}
        className="mt-4 sm:mt-6"
      />
    </section>
  );
}
