import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type VisibilityState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState } from './states';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

type Meta = { page: number; pageSize: number; total: number };

/** Column meta: `sortKey` makes a header sortable on the server (api-contract.md §1.2). */
export type DataTableColumn<T> = ColumnDef<T> & { meta?: { sortKey?: string; label?: string } };

/**
 * Server-driven table: pagination, sorting and filtering happen in the API; this renders the
 * current page with loading, empty and error states plus a column-visibility menu.
 */
export function DataTable<T>({
  columns,
  data,
  meta,
  isLoading,
  error,
  onRetry,
  sort,
  onSortChange,
  onPageChange,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  toolbar,
}: {
  columns: DataTableColumn<T>[];
  data: T[] | undefined;
  meta: Meta | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  sort: string;
  onSortChange: (sort: string) => void;
  onPageChange: (page: number) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  toolbar?: React.ReactNode;
}) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  // TanStack Table v8 returns non-memoisable functions; the React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  });

  const pageCount = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;
  const sortField = sort.replace(/^-/, '');
  const descending = sort.startsWith('-');

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 aria-hidden />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            {table
              .getAllLeafColumns()
              .filter((c) => c.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(v) => column.toggleVisibility(Boolean(v))}
                  onSelect={(e) => e.preventDefault()}
                >
                  {(column.columnDef as DataTableColumn<T>).meta?.label ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : (
        <Table aria-busy={isLoading}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const sortKey = (header.column.columnDef as DataTableColumn<T>).meta?.sortKey;
                  const content = flexRender(header.column.columnDef.header, header.getContext());
                  const active = sortKey === sortField;
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={active ? (descending ? 'descending' : 'ascending') : undefined}
                    >
                      {sortKey ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          onClick={() =>
                            onSortChange(active && !descending ? `-${sortKey}` : sortKey)
                          }
                        >
                          {content}
                          {active &&
                            (descending ? (
                              <ArrowDown className="size-3" aria-hidden />
                            ) : (
                              <ArrowUp className="size-3" aria-hidden />
                            ))}
                        </button>
                      ) : (
                        content
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading && !data
              ? Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={table.getVisibleLeafColumns().length}>
                      <div className="h-4 animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              : table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      )}

      {!error && data && data.length === 0 && (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}

      {meta && meta.total > 0 && (
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-sm text-muted-foreground">
          <span>
            {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)}{' '}
            of {meta.total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous page"
              disabled={meta.page <= 1}
              onClick={() => onPageChange(meta.page - 1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <span aria-live="polite">
              Page {meta.page} of {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next page"
              disabled={meta.page >= pageCount}
              onClick={() => onPageChange(meta.page + 1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
