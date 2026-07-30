import { useMemo, useState, type ReactNode } from 'react';
import { Columns3 } from 'lucide-react';
import { Link } from 'react-router';
import type { DataTableColumn, DataTableProps } from '@booking/ui/components/data-table/data-table';
import { DataTable } from '@booking/ui/components/data-table/data-table';
import { Button } from '@booking/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@booking/ui/components/ui/dropdown-menu';
import { cn } from '@booking/ui/lib/utils';
import type { FilterSpec } from '~/lib/list-filters';
import { ErrorBanner } from './action-feedback';
import { ListToolbar } from './list-toolbar';
import { PaginationBar } from './pagination-bar';

export interface DashboardDataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (target: { page: number; pageSize: number }) => string;
  pageSizeOptions?: readonly number[];
}

export interface DashboardDataTableSearch {
  key?: string;
  label?: string;
  placeholder?: string;
}

export interface DashboardDataTableTab {
  value: string;
  label: ReactNode;
  href: string;
}

export interface DashboardDataTableTabs {
  activeValue: string;
  items: readonly DashboardDataTableTab[];
  ariaLabel?: string;
}

export interface DashboardDataTableProps<T> extends Omit<
  DataTableProps<T>,
  'columns' | 'visibleColumnIds'
> {
  columns: DataTableColumn<T>[];
  /** URL-backed list views, rendered above the optional toolbar. */
  tabs?: DashboardDataTableTabs;
  /** Omit to hide search. */
  search?: DashboardDataTableSearch;
  /** Config-driven URL filters. Omit or pass an empty array to hide them. */
  filters?: FilterSpec;
  filterValues?: Record<string, string>;
  resetHref?: string;
  pageSize?: number;
  customFilters?: ReactNode;
  actions?: ReactNode;
  enableColumnVisibility?: boolean;
  pagination?: DashboardDataTablePagination;
  error?: ReactNode;
  contentClassName?: string;
}

/**
 * Dashboard list surface: a config-driven DataTable plus URL-backed filters,
 * optional column visibility, route actions and server pagination. It owns only
 * presentation state; data still comes from React Router loaders/actions.
 */
export function DashboardDataTable<T>({
  columns,
  tabs,
  search,
  filters = [],
  filterValues = {},
  resetHref = '.',
  pageSize = 20,
  customFilters,
  actions,
  enableColumnVisibility = false,
  pagination,
  error,
  contentClassName,
  className,
  ...tableProps
}: DashboardDataTableProps<T>) {
  const searchField = useMemo(
    () =>
      search
        ? {
            kind: 'text' as const,
            key: search.key ?? 'q',
            label: search.label ?? 'Tìm kiếm',
            placeholder: search.placeholder ?? 'Tìm kiếm…',
          }
        : undefined,
    [search],
  );

  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(
    () =>
      new Set(
        columns
          .filter((column) => column.id && column.defaultVisible === false)
          .map((column) => column.id!),
      ),
  );

  const hideableColumns = useMemo(
    () => columns.filter((column) => column.id && column.enableHiding !== false),
    [columns],
  );
  const visibleColumnIds = useMemo(
    () =>
      new Set(
        columns.flatMap((column) =>
          column.id && !hiddenColumnIds.has(column.id) ? [column.id] : [],
        ),
      ),
    [columns, hiddenColumnIds],
  );

  const columnControl =
    enableColumnVisibility && hideableColumns.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="control">
            <Columns3 aria-hidden />
            <span className="hidden sm:inline">Cột</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Hiển thị cột</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {hideableColumns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={!hiddenColumnIds.has(column.id!)}
              onCheckedChange={(checked) => {
                setHiddenColumnIds((current) => {
                  const next = new Set(current);
                  if (checked) next.delete(column.id!);
                  else next.add(column.id!);
                  return next;
                });
              }}
              onSelect={(event) => event.preventDefault()}
            >
              {column.columnLabel ??
                (typeof column.header === 'string' ? column.header : column.id)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const showToolbar = Boolean(searchField || filters.length > 0 || customFilters || actions || columnControl);

  return (
    <section className={cn('w-full min-w-0 max-w-full bg-transparent', className)}>
      {tabs && tabs.items.length > 0 ? (
        <nav
          aria-label={tabs.ariaLabel ?? 'Điều hướng danh sách'}
          className="flex flex-wrap items-end gap-x-5 gap-y-1 px-4 pt-1 lg:px-5"
        >
          {tabs.items.map((item) => {
            const isActive = item.value === tabs.activeValue;

            return (
              <Link
                key={item.value}
                to={item.href}
                prefetch="intent"
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
      {showToolbar ? (
        <div className="w-full min-w-0 max-w-full px-4 py-4 lg:px-5">
          <ListToolbar
            spec={filters}
            filters={filterValues}
            resetHref={resetHref}
            pageSize={pageSize}
            searchField={searchField}
            customFilters={customFilters}
            actions={actions}
            utilities={columnControl}
            variant="compact"
            layout="split"
          />
        </div>
      ) : null}

      {error ? (
        <div className="px-4 pt-4 lg:px-5">
          <ErrorBanner error={error} />
        </div>
      ) : null}

      <div
        className={cn(
          'w-full min-w-0 max-w-full overflow-hidden p-4 lg:p-5',
          contentClassName,
        )}
      >
        <DataTable
          {...tableProps}
          columns={columns}
          visibleColumnIds={visibleColumnIds}
          headerClassName="bg-muted/55"
          className="w-full min-w-0 max-w-full overflow-hidden rounded-none border-0"
        />
      </div>

      {pagination ? (
        <div className="px-4 py-4 lg:px-5">
          <PaginationBar {...pagination} />
        </div>
      ) : null}
    </section>
  );
}
