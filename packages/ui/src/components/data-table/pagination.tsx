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
  /** Accessible label for the pagination navigation landmark. */
  navigation: string;
  /** Accessible label for a numbered-page link. */
  page: (page: number) => string;
  /** Label before the page-size select, e.g. "Số dòng". */
  rowsPerPage: string;
  /** e.g. (1, 20, 137) => "1–20 trên 137". */
  showing: (from: number, to: number, total: number) => string;
  /** e.g. (2, 7) => "Trang 2 / 7". */
  currentPage: (page: number, totalPages: number) => string;
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
 * Shared, label-agnostic pagination footer — range/total + rows-per-page at left,
 * compact URL-driven navigation at right. Numbered links are desktop-only; mobile
 * shows a current/total summary instead. No browser data fetch is involved.
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
        <PaginationNav aria-label={labels.navigation} className="mx-0 w-auto justify-end">
          <PaginationContent className="gap-1">
            <PaginationItem>
              <Link
                to={hrefFor({ page: current - 1, pageSize })}
                prefetch="intent"
                aria-label={labels.previous}
                aria-disabled={!hasPrev}
                tabIndex={hasPrev ? undefined : -1}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'icon' }),
                  !hasPrev && 'pointer-events-none opacity-50',
                )}
              >
                <ChevronLeftIcon />
                <span className="sr-only">{labels.previous}</span>
              </Link>
            </PaginationItem>

            <PaginationItem className="sm:hidden">
              <span className="px-1 text-xs text-muted-foreground tabular-nums">
                {labels.currentPage(current, totalPages)}
              </span>
            </PaginationItem>

            {range.map((token, i) =>
              token === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${i}`} className="hidden sm:block">
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={token} className="hidden sm:block">
                  <Link
                    to={hrefFor({ page: token, pageSize })}
                    prefetch="intent"
                    aria-label={labels.page(token)}
                    aria-current={token === current ? 'page' : undefined}
                    className={cn(
                      buttonVariants({
                        variant: token === current ? 'default' : 'ghost',
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
                  buttonVariants({ variant: 'ghost', size: 'icon' }),
                  !hasNext && 'pointer-events-none opacity-50',
                )}
              >
                <span className="sr-only">{labels.next}</span>
                <ChevronRightIcon />
              </Link>
            </PaginationItem>
          </PaginationContent>
        </PaginationNav>
      ) : null}
    </div>
  );
}
