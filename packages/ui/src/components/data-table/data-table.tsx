'use client';

import * as React from 'react';

import { cn } from '@booking/ui/lib/utils';
import { Skeleton } from '@booking/ui/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@booking/ui/components/ui/table';

export interface DataTableColumn<T> {
  /** Stable identifier used by optional column-visibility controls. */
  id?: string;
  /** Column header text. */
  header: React.ReactNode;
  /** Plain-text label for a column-visibility menu. */
  columnLabel?: string;
  /** Whether a dashboard may hide this column. Defaults to true when `id` exists. */
  enableHiding?: boolean;
  /** Initial visibility for uncontrolled dashboard tables. Defaults to true. */
  defaultVisible?: boolean;
  /** Optional native table sizing shared by the header and body cells. */
  size?: Pick<React.CSSProperties, 'width' | 'minWidth' | 'maxWidth'>;
  /** Hide the column below a dashboard breakpoint without JavaScript. */
  responsive?: { hideBelow?: 'sm' | 'md' | 'lg' | 'xl' };
  /** Cell renderer for a row. */
  cell: (row: T, index: number) => React.ReactNode;
  /** Optional class for the `<td>`. */
  className?: string;
  /** Optional class for the `<th>`. */
  headClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** When true, render `skeletonRows` shimmer rows instead of data. */
  isLoading?: boolean;
  skeletonRows?: number;
  /** Rendered when `data` is empty and not loading. */
  emptyMessage?: React.ReactNode;
  /** Stable row key; defaults to the row index. */
  getRowKey?: (row: T, index: number) => React.Key;
  /** Visible column IDs. Columns without an ID always remain visible. */
  visibleColumnIds?: ReadonlySet<string> | readonly string[];
  /** Optional row class resolver for status/selection treatments. */
  rowClassName?: (row: T, index: number) => string | undefined;
  /** Optional table-header treatment for composed dashboard surfaces. */
  headerClassName?: string;
  className?: string;
}

const responsiveColumnClass = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
} as const;

/**
 * Thin, config-driven table over the shadcn `Table` primitive with built-in
 * loading (skeleton) and empty states — the shared list-screen surface the area
 * dashboards build on. For anything richer (sorting, selection) compose the
 * primitives directly.
 */
export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  skeletonRows = 5,
  emptyMessage = 'Không có dữ liệu.',
  getRowKey,
  visibleColumnIds,
  rowClassName,
  headerClassName,
  className,
}: DataTableProps<T>) {
  const visibleIds = visibleColumnIds
    ? visibleColumnIds instanceof Set
      ? visibleColumnIds
      : new Set(visibleColumnIds)
    : null;
  const renderedColumns = visibleIds
    ? columns.filter((column) => !column.id || visibleIds.has(column.id))
    : columns;

  return (
    <div
      className={cn(
        'w-full min-w-0 max-w-full overflow-hidden rounded-md border [&_[data-slot=table-container]]:overscroll-x-contain',
        className,
      )}
    >
      <Table className="w-max min-w-full">
        <TableHeader className={headerClassName}>
          <TableRow>
            {renderedColumns.map((col, i) => (
              <TableHead
                key={col.id ?? i}
                style={col.size}
                className={cn(
                  col.responsive?.hideBelow && responsiveColumnClass[col.responsive.hideBelow],
                  col.headClassName,
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: skeletonRows }).map((_, r) => (
              <TableRow key={`skeleton-${r}`}>
                {renderedColumns.map((col, c) => (
                  <TableCell
                    key={col.id ?? c}
                    style={col.size}
                    className={cn(
                      col.responsive?.hideBelow && responsiveColumnClass[col.responsive.hideBelow],
                    )}
                  >
                    <Skeleton className="h-4 w-full max-w-[160px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={Math.max(1, renderedColumns.length)}
                className="h-24 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, r) => (
              <TableRow key={getRowKey ? getRowKey(row, r) : r} className={rowClassName?.(row, r)}>
                {renderedColumns.map((col, c) => (
                  <TableCell
                    key={col.id ?? c}
                    style={col.size}
                    className={cn(
                      col.responsive?.hideBelow && responsiveColumnClass[col.responsive.hideBelow],
                      col.className,
                    )}
                  >
                    {col.cell(row, r)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
