import { Skeleton } from '@booking/ui/components/ui/skeleton';
import { cn } from '@booking/ui/lib/utils';
import type { ComponentProps, ReactNode } from 'react';

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
      className="grid overflow-hidden rounded-lg border-[1.4px] border-border bg-card md:h-46 md:grid-cols-[248px_120px_minmax(0,1fr)] md:gap-x-1.5"
      aria-hidden="true"
    >
      <StorefrontSkeleton className="min-h-52 rounded-none md:min-h-0" />
      <div className="hidden min-h-0 grid-rows-2 gap-1.5 bg-muted md:grid">
        <StorefrontSkeleton className="min-h-0 rounded-none" />
        <StorefrontSkeleton className="min-h-0 rounded-none" />
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-3 px-5 py-4 md:pr-6 md:pl-[18px]">
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
    <LoadingRegion label={label} className="rounded-lg bg-card p-5 shadow-sm sm:p-6">
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
    <LoadingRegion label={label} className="rounded-lg bg-card p-5 shadow-sm sm:p-6">
      <StorefrontSkeleton className="mb-5 h-6 w-44" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-lg border bg-background">
            <StorefrontSkeleton className="aspect-4/3 rounded-none" />
            <div className="space-y-2 p-4">
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
      <div
        className={cn(
          layout === 'grid'
            ? 'grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
            : 'flex gap-4 overflow-hidden',
        )}
      >
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            className={cn(
              'min-w-0 overflow-hidden rounded-lg border bg-background',
              layout === 'carousel' &&
                'basis-[88%] shrink-0 sm:basis-[calc(50%-0.5rem)] md:basis-[calc(33.333%-0.667rem)] lg:basis-[calc(25%-0.75rem)]',
            )}
          >
            <StorefrontSkeleton className="aspect-4/3 rounded-none" />
            <div className="space-y-2 p-4">
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
    <div key={index} className="rounded-lg border bg-background p-5">
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
    <div className="rounded-none border bg-background px-6 py-8 sm:px-8">
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
    <div className="space-y-4">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="rounded-lg border bg-background p-5 sm:p-6">
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
    <LoadingRegion label={label} className="space-y-4 py-2 font-studio">
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
