import { Skeleton } from '@booking/ui/components/ui/skeleton';
import { cn } from '@booking/ui/lib/utils';
import type { ComponentProps } from 'react';
import {
  CATALOG_RESULT_CARD_SHELL_CLASS,
  CATALOG_RESULT_CONTENT_CLASS,
  CATALOG_RESULT_PRIMARY_MEDIA_CLASS,
  CATALOG_RESULT_SECONDARY_MEDIA_CLASS,
} from './catalog-result-card-layout';

function CatalogSkeletonBlock({ className, ...props }: ComponentProps<typeof Skeleton>) {
  return <Skeleton className={cn('motion-reduce:animate-none', className)} {...props} />;
}

/** Loading state for the specialised horizontal catalogue result row. */
export function CatalogResultSkeleton() {
  return (
    <div className={CATALOG_RESULT_CARD_SHELL_CLASS} aria-hidden="true">
      <CatalogSkeletonBlock className={CATALOG_RESULT_PRIMARY_MEDIA_CLASS} />

      <div className={CATALOG_RESULT_SECONDARY_MEDIA_CLASS}>
        <CatalogSkeletonBlock className="min-h-0 rounded-none" />
        <CatalogSkeletonBlock className="min-h-0 rounded-none" />
      </div>

      <CatalogSkeletonBlock className="absolute top-2.5 right-2.5 z-10 size-8 rounded-full md:top-6 md:right-auto md:left-[310px] md:size-10" />

      <div className={CATALOG_RESULT_CONTENT_CLASS}>
        <div className="min-w-0">
          <CatalogSkeletonBlock className="mr-9 h-[18px] w-3/4 md:mr-0 md:h-7 md:w-3/5" />
          <div className="mt-0.5 flex items-center gap-1 md:mt-1 md:gap-2">
            <CatalogSkeletonBlock className="size-3.5 shrink-0 rounded-full md:size-5" />
            <CatalogSkeletonBlock className="h-3 w-3/5 md:h-5 md:w-2/5" />
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 md:mt-0 md:flex-col md:items-stretch md:gap-3">
          <div className="flex min-w-0 items-center gap-3 md:justify-between">
            <CatalogSkeletonBlock className="h-3 w-16 md:h-5 md:w-24" />
            <CatalogSkeletonBlock className="h-3 w-12 md:h-5 md:w-20" />
          </div>

          <div className="flex shrink-0 items-end justify-end text-right">
            <div className="flex flex-col items-end gap-1">
              <CatalogSkeletonBlock className="h-5 w-24 md:h-7 md:w-32" />
              <CatalogSkeletonBlock className="h-3 w-14 md:h-5 md:w-20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
