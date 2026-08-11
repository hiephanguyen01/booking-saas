import { Skeleton } from '@booking/ui/components/ui/skeleton';
import { cn } from '@booking/ui/lib/utils';
import type { ComponentProps, ReactNode } from 'react';
import { PANEL_SURFACE, SURFACE_FRAME } from '~/constants/surfaces';

function StorefrontSkeleton({ className, ...props }: ComponentProps<typeof Skeleton>) {
  return <Skeleton className={cn('motion-reduce:animate-none', className)} {...props} />;
}

function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      <div aria-hidden="true">{children}</div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function CatalogResultSkeleton() {
  return (
    <div
      className={cn(
        PANEL_SURFACE,
        'flex min-h-32 gap-3 overflow-hidden bg-card p-(--sf-surface-pad) md:grid md:h-46 md:min-h-0 md:grid-cols-[248px_120px_minmax(0,1fr)] md:gap-x-1.5 md:rounded-lg md:border-[1.4px] md:border-border md:p-0 md:shadow-none',
      )}
      aria-hidden="true"
    >
      <StorefrontSkeleton className="w-28 shrink-0 rounded-(--sf-image-radius) md:w-auto md:min-h-0 md:rounded-none" />
      <div className="hidden min-h-0 grid-rows-2 gap-1.5 bg-muted md:grid">
        <StorefrontSkeleton className="min-h-0 rounded-none" />
        <StorefrontSkeleton className="min-h-0 rounded-none" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-1 md:gap-3 md:px-5 md:py-4 md:pr-6 md:pl-[18px]">
        <div className="flex flex-col gap-2">
          <StorefrontSkeleton className="h-7 w-3/5" />
          <StorefrontSkeleton className="h-5 w-2/5" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <StorefrontSkeleton className="h-4 w-24" />
          <StorefrontSkeleton className="h-5 w-24" />
        </div>
        <div className="flex flex-col items-end gap-1">
          <StorefrontSkeleton className="h-6 w-48" />
          <StorefrontSkeleton className="h-5 w-20" />
        </div>
      </div>
    </div>
  );
}

export function SearchBarSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label} className="bg-foreground font-studio text-background">
      <div className="mx-auto max-w-292.5 px-4 pb-6 lg:px-0">
        <div className="flex h-14 items-end gap-5 overflow-hidden py-3">
          {Array.from({ length: 5 }, (_, index) => (
            <StorefrontSkeleton
              key={index}
              className={cn('h-4 bg-background/20', index === 0 ? 'w-20' : 'w-16')}
            />
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="h-16 rounded-md bg-background/10 px-4 py-3">
                <StorefrontSkeleton className="h-3 w-16 bg-background/20" />
                <StorefrontSkeleton className="mt-2 h-4 w-4/5 bg-background/25" />
              </div>
            ))}
          </div>
          <div className="flex h-16 items-center justify-center rounded-md bg-primary/60 px-7">
            <StorefrontSkeleton className="h-4 w-16 bg-primary-foreground/30" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}

export function ReviewsSectionSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion
      label={label}
      className={cn(
        PANEL_SURFACE,
        'bg-card p-(--sf-surface-pad) md:rounded-lg md:border-0 md:p-6 md:shadow-sm',
      )}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <StorefrontSkeleton className="h-6 w-40" />
          <StorefrontSkeleton className="h-9 w-24" />
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="grid gap-3 border-t pt-4 sm:grid-cols-[8rem_1fr]">
            <div className="space-y-2">
              <StorefrontSkeleton className="h-4 w-24" />
              <StorefrontSkeleton className="h-3.5 w-16" />
            </div>
            <div className="space-y-2">
              <StorefrontSkeleton className="h-4 w-28" />
              <StorefrontSkeleton className="h-3.5 w-full" />
              <StorefrontSkeleton className="h-3.5 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function RelatedListingsSkeleton({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <LoadingRegion
      label={label}
      className={cn(
        PANEL_SURFACE,
        'bg-card p-(--sf-surface-pad) md:rounded-lg md:border-0 md:p-6 md:shadow-sm',
      )}
    >
      <StorefrontSkeleton className="mb-5 h-6 w-44" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            className={cn(
              PANEL_SURFACE,
              'overflow-hidden bg-background md:rounded-lg md:border md:border-border md:shadow-none',
            )}
          >
            <StorefrontSkeleton className="aspect-4/3 rounded-none" />
            <div className="space-y-2 p-(--sf-surface-pad) md:p-4">
              <StorefrontSkeleton className="h-5 w-4/5" />
              <StorefrontSkeleton className="h-3.5 w-3/5" />
              <StorefrontSkeleton className="ml-auto h-5 w-28" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function HomeListingCardsSkeleton({
  label,
  count,
  layout,
}: {
  label: string;
  count: number;
  layout: 'carousel' | 'grid';
}) {
  return (
    <LoadingRegion label={label}>
      {/* Both variants mirror `ListingCard`'s stacked shape, because that is what
          both home layouts now render — two up in the recommendation grid and a
          208px slide in the rails. A skeleton with the other shape hands the page
          a layout jump the moment the data lands. */}
      <div
        className={cn(
          layout === 'grid'
            ? 'grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6'
            : 'flex gap-3 overflow-hidden sm:gap-4 xl:gap-6',
        )}
      >
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            className={cn(
              SURFACE_FRAME,
              'h-72 min-w-0 overflow-hidden bg-card sm:h-98.5',
              layout === 'carousel'
                ? 'basis-[13rem] shrink-0 sm:basis-[calc((100%_-_2rem)/3)] lg:basis-[calc((100%_-_3rem)/4)] xl:basis-[277.5px]'
                : '',
            )}
          >
            <StorefrontSkeleton className="h-34 rounded-(--sf-image-radius) sm:h-46 sm:rounded-none" />
            <div className="space-y-3 p-(--sf-surface-pad)">
              <StorefrontSkeleton className="h-6 w-4/5" />
              <StorefrontSkeleton className="h-5 w-3/5" />
              <StorefrontSkeleton className="h-5 w-full" />
              <StorefrontSkeleton className="ml-auto h-10 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export type AccountContentSkeletonVariant = 'list' | 'form' | 'detail';

export function AccountResultsSkeleton({ label, count = 4 }: { label: string; count?: number }) {
  return (
    <LoadingRegion label={label} className="space-y-3">
      <AccountResultRows count={count} />
    </LoadingRegion>
  );
}

function AccountResultRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <div
      key={index}
      className={cn(
        PANEL_SURFACE,
        'bg-background p-(--sf-surface-pad) md:rounded-lg md:border md:border-border md:p-5 md:shadow-none',
      )}
    >
      <div className="flex items-center gap-4">
        <StorefrontSkeleton className="size-16 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <StorefrontSkeleton className="h-5 w-2/3" />
          <StorefrontSkeleton className="h-3.5 w-1/2" />
          <StorefrontSkeleton className="h-4 w-28" />
        </div>
      </div>
    </div>
  ));
}

function AccountFormSkeletonBody() {
  return (
    <div
      className={cn(
        PANEL_SURFACE,
        'bg-background p-(--sf-surface-pad) md:rounded-none md:border md:border-border md:px-8 md:py-8 md:shadow-none',
      )}
    >
      <div className="mb-8 flex items-center gap-4">
        <StorefrontSkeleton className="size-18 rounded-full" />
        <div className="space-y-2">
          <StorefrontSkeleton className="h-4 w-36" />
          <StorefrontSkeleton className="h-3.5 w-48" />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="space-y-2">
            <StorefrontSkeleton className="h-3.5 w-24" />
            <StorefrontSkeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountDetailSkeletonBody() {
  return (
    <div className="space-y-(--sf-section-gap) md:space-y-4">
      {Array.from({ length: 2 }, (_, index) => (
        <div
          key={index}
          className={cn(
            PANEL_SURFACE,
            'bg-background p-(--sf-surface-pad) md:rounded-lg md:border md:border-border md:p-6 md:shadow-none',
          )}
        >
          <StorefrontSkeleton className="h-5 w-40" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, row) => (
              <div key={row} className="space-y-2">
                <StorefrontSkeleton className="h-3.5 w-20" />
                <StorefrontSkeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AccountListSkeletonBody() {
  return (
    <div className="space-y-3">
      <StorefrontSkeleton className="h-12 w-full rounded-none" />
      <AccountResultRows count={4} />
    </div>
  );
}

const ACCOUNT_SKELETON_BODIES: Record<AccountContentSkeletonVariant, () => React.ReactElement> = {
  form: AccountFormSkeletonBody,
  detail: AccountDetailSkeletonBody,
  list: AccountListSkeletonBody,
};

export function AccountContentSkeleton({
  label,
  variant,
}: {
  label: string;
  variant: AccountContentSkeletonVariant;
}) {
  const Body = ACCOUNT_SKELETON_BODIES[variant];
  return (
    <LoadingRegion
      label={label}
      className="space-y-(--sf-section-gap) py-2 font-studio md:space-y-4"
    >
      <StorefrontSkeleton className="h-6 w-44" />
      <Body />
    </LoadingRegion>
  );
}

export function AvailabilitySkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label}>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 8 }, (_, index) => (
          <StorefrontSkeleton key={index} className="h-14" />
        ))}
      </div>
    </LoadingRegion>
  );
}

export function QuoteSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label}>
      <StorefrontSkeleton className="h-5 w-28" />
    </LoadingRegion>
  );
}
