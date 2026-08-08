import type { ReactNode } from 'react';
import { SectionCard } from '~/components/section-card';
import { cn } from '@booking/ui/lib/utils';

export function DetailPageLayout({
  searchBar,
  header,
  mobileHeader,
  gallery,
  mobileSummary,
  main,
  booking,
  provider,
  footerSections,
  desktopAsideOrder = 'booking-first',
  mobileBooking = true,
}: {
  searchBar: ReactNode;
  header: ReactNode;
  mobileHeader: ReactNode;
  gallery: ReactNode;
  mobileSummary: ReactNode;
  main: ReactNode;
  booking?: ReactNode;
  provider: ReactNode;
  footerSections?: ReactNode;
  desktopAsideOrder?: 'booking-first' | 'provider-first';
  mobileBooking?: boolean;
}) {
  return (
    <div className="overflow-x-clip bg-muted/30 pb-5 font-studio text-foreground md:pb-20">
      <div className="max-md:hidden">{searchBar}</div>
      <div className="contents md:hidden">{mobileHeader}</div>
      {/* `--sf-section-gap` is the tenant's density setting: it separates the
          stacked panels here, which is what "khoảng cách khối" means on a detail
          page. Hard-coded `gap-4` left that setting controlling nothing. */}
      <main className="mx-auto flex max-w-292.5 flex-col gap-(--sf-section-gap) py-0 md:px-4 md:py-4 xl:px-0">
        <SectionCard className="max-md:rounded-none max-md:border-x-0 max-md:p-0 max-md:shadow-none">
          <div className="max-md:hidden">{header}</div>
          {gallery}
        </SectionCard>
        <div className="md:hidden">{mobileSummary}</div>
        <div className="flex flex-col gap-(--sf-section-gap) md:px-0 lg:grid lg:items-start lg:grid-cols-[minmax(0,870px)_284px]">
          <div className="contents min-w-0 [&>*]:order-3 md:flex md:flex-col md:gap-(--sf-section-gap) md:[&>*]:order-none">
            {main}
          </div>
          {/* `min-w-0` like the main column: without it the aside's booking card
              keeps its min-content width and widens the single-column track. */}
          <aside className="contents min-w-0 md:flex md:flex-col md:gap-(--sf-section-gap) lg:sticky lg:top-24">
            {booking ? (
              <div
                className={cn(
                  'order-4 max-md:px-3',
                  !mobileBooking && 'max-md:hidden',
                  desktopAsideOrder === 'provider-first' ? 'md:order-2' : 'md:order-1',
                )}
              >
                {booking}
              </div>
            ) : null}
            <div
              className={cn(
                'order-2 max-md:px-3',
                desktopAsideOrder === 'provider-first' ? 'md:order-1' : 'md:order-2',
              )}
            >
              {provider}
            </div>
          </aside>
        </div>
        {footerSections ? (
          <div className="order-5 flex flex-col gap-(--sf-section-gap) max-md:px-3">
            {footerSections}
          </div>
        ) : null}
      </main>
    </div>
  );
}
