import type { ReactNode } from 'react';
import { SectionCard } from '~/components/section-card';

export function DetailPageLayout({
  searchBar,
  header,
  gallery,
  main,
  aside,
  footerSections,
}: {
  searchBar: ReactNode;
  header: ReactNode;
  gallery: ReactNode;
  main: ReactNode;
  aside: ReactNode;
  footerSections?: ReactNode;
}) {
  return (
    <div className="font-studio overflow-x-clip bg-muted/30 pb-20 text-foreground">
      {searchBar}
      <main className="mx-auto flex max-w-292.5 flex-col gap-4 px-4 py-4 xl:px-0">
        <SectionCard>
          {header}
          {gallery}
        </SectionCard>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,870px)_284px]">
          <div className="flex min-w-0 flex-col gap-4">{main}</div>
          {/* `min-w-0` like the main column: without it the aside's booking card
              keeps its min-content width and widens the single-column track. */}
          <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24">{aside}</aside>
        </div>
        {footerSections}
      </main>
    </div>
  );
}
