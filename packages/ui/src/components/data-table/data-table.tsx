"use client"

import * as React from "react"

import { cn } from "@booking/ui/lib/utils"
import { Skeleton } from "@booking/ui/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@booking/ui/components/ui/table"

export interface DataTableColumn<T> {
  /** Column header text. */
  header: React.ReactNode
  /** Cell renderer for a row. */
  cell: (row: T, index: number) => React.ReactNode
  /** Optional class for the `<td>`. */
  className?: string
  /** Optional class for the `<th>`. */
  headClassName?: string
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  /** When true, render `skeletonRows` shimmer rows instead of data. */
  isLoading?: boolean
  skeletonRows?: number
  /** Rendered when `data` is empty and not loading. */
  emptyMessage?: React.ReactNode
  /** Stable row key; defaults to the row index. */
  getRowKey?: (row: T, index: number) => React.Key
  className?: string
}

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
  emptyMessage = "Không có dữ liệu.",
  getRowKey,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("rounded-md border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col, i) => (
              <TableHead key={i} className={col.headClassName}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: skeletonRows }).map((_, r) => (
              <TableRow key={`skeleton-${r}`}>
                {columns.map((_col, c) => (
                  <TableCell key={c}>
                    <Skeleton className="h-4 w-full max-w-[160px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, r) => (
              <TableRow key={getRowKey ? getRowKey(row, r) : r}>
                {columns.map((col, c) => (
                  <TableCell key={c} className={col.className}>
                    {col.cell(row, r)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
