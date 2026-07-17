'use client';

import * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { cn } from '@booking/ui/lib/utils';
import { buttonVariants } from '@booking/ui/components/ui/button';
import {
  Pagination as PaginationNav,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from '@booking/ui/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { usePagination } from '@booking/ui/hooks/use-pagination';

export interface PaginationLabels {
  previous: string;
  next: string;
  /** Label before the page-size select, e.g. "Số dòng". */
  rowsPerPage: string;
  /** e.g. (1, 20, 137) => "1–20 / 137". */
  showing: (from: number, to: number, total: number) => string;
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Builds an href for a target page/pageSize, preserving active filters. */
  hrefFor: (target: { page: number; pageSize: number }) => string;
  /** Page-size choices; omit/empty to hide the rows-per-page select. */
  pageSizeOptions?: readonly number[];
  labels: PaginationLabels;
  siblingCount?: number;
  className?: string;
}

/**
 * Shared, label-agnostic pagination footer — numbered pages + ellipsis + prev/next
 * + a rows-per-page select + a "showing X–Y of N" count. Navigation is href-driven
 * (react-router <Link>/navigate) so the loader re-runs; no browser data fetch. All
 * copy comes from `labels`, so dashboard (vi) and storefront (i18n) both reuse it.
 * Renders nothing when the list is empty.
 */
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
  pageSizeOptions,
  labels,
  siblingCount = 1,
  className,
}: PaginationProps) {
  const navigate = useNavigate();
  const { totalPages, hasPrev, hasNext, from, to, range } = usePagination({
    page,
    pageSize,
    total,
    siblingCount,
  });

  if (total === 0) return null;

  const current = Math.min(Math.max(1, page), totalPages);
  const showSizeSelect = pageSizeOptions && pageSizeOptions.length > 0;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex items-center gap-4 text-muted-foreground">
        <span className="tabular-nums">{labels.showing(from, to, total)}</span>
        {showSizeSelect ? (
          <label className="flex items-center gap-2">
            <span className="whitespace-nowrap">{labels.rowsPerPage}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => navigate(hrefFor({ page: 1, pageSize: Number(v) }))}
            >
              <SelectTrigger size="sm" className="w-[4.5rem]" aria-label={labels.rowsPerPage}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <PaginationNav className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <Link
                to={hrefFor({ page: current - 1, pageSize })}
                prefetch="intent"
                aria-label={labels.previous}
                aria-disabled={!hasPrev}
                tabIndex={hasPrev ? undefined : -1}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'default' }),
                  'gap-1 px-2.5',
                  !hasPrev && 'pointer-events-none opacity-50',
                )}
              >
                <ChevronLeftIcon />
                <span className="hidden sm:block">{labels.previous}</span>
              </Link>
            </PaginationItem>

            {range.map((token, i) =>
              token === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={token}>
                  <Link
                    to={hrefFor({ page: token, pageSize })}
                    prefetch="intent"
                    aria-current={token === current ? 'page' : undefined}
                    className={cn(
                      buttonVariants({
                        variant: token === current ? 'outline' : 'ghost',
                        size: 'icon',
                      }),
                      'tabular-nums',
                    )}
                  >
                    {token}
                  </Link>
                </PaginationItem>
              ),
            )}

            <PaginationItem>
              <Link
                to={hrefFor({ page: current + 1, pageSize })}
                prefetch="intent"
                aria-label={labels.next}
                aria-disabled={!hasNext}
                tabIndex={hasNext ? undefined : -1}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'default' }),
                  'gap-1 px-2.5',
                  !hasNext && 'pointer-events-none opacity-50',
                )}
              >
                <span className="hidden sm:block">{labels.next}</span>
                <ChevronRightIcon />
              </Link>
            </PaginationItem>
          </PaginationContent>
        </PaginationNav>
      ) : null}
    </div>
  );
}
