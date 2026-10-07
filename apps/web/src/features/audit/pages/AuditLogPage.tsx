import {
  type AuditLog,
  auditLogSchema,
  type AuditLogListQuery,
  paginatedSchema,
} from '@staffos/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import { formatDateTime, toQueryString } from '@/lib/format';

function useAuditLogs(query: Partial<AuditLogListQuery>) {
  return useQuery({
    queryKey: ['audit-logs', query],
    queryFn: () => apiFetch(`/audit-logs?${toQueryString(query)}`, paginatedSchema(auditLogSchema)),
    placeholderData: keepPreviousData,
  });
}

const json = (value: unknown) =>
  value === null || value === undefined ? '—' : JSON.stringify(value, null, 2);

/** Read-only audit trail (US-AUDIT-01). Values are rendered as text, never as HTML. */
export function AuditLogPage() {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const set = (key: string, value?: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    });

  const query = {
    page: Number(params.get('page') ?? 1),
    pageSize: 25,
    sort: params.get('sort') ?? '-createdAt',
    search: params.get('search') ?? undefined,
    filter: {
      entity: params.get('entity') ?? undefined,
      action: params.get('action') ?? undefined,
    },
  };
  const logs = useAuditLogs(query);

  const columns = useMemo<DataTableColumn<AuditLog>[]>(
    () => [
      {
        id: 'createdAt',
        header: 'When',
        enableHiding: false,
        meta: { sortKey: 'createdAt', label: 'When' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>
        ),
      },
      {
        id: 'actor',
        header: 'Who',
        meta: { label: 'Who' },
        cell: ({ row }) =>
          row.original.actor?.name ?? (
            <span className="text-muted-foreground">System / public</span>
          ),
      },
      {
        id: 'action',
        header: 'Action',
        meta: { label: 'Action' },
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span>,
      },
      {
        id: 'entity',
        header: 'Record',
        meta: { label: 'Record' },
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.entity}
            {row.original.entityId && (
              <span className="block font-mono text-muted-foreground">{row.original.entityId}</span>
            )}
          </span>
        ),
      },
      {
        id: 'ip',
        header: 'IP',
        meta: { label: 'IP' },
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.ip ?? '—'}</span>,
      },
      {
        id: 'details',
        header: () => <span className="sr-only">Details</span>,
        enableHiding: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => setSelected(row.original)}>
            Details
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change and sensitive read, with who did it and when. Entries cannot be edited."
      />
      <DataTable
        columns={columns}
        data={logs.data?.data}
        meta={logs.data?.meta}
        isLoading={logs.isPending}
        error={logs.error}
        onRetry={() => void logs.refetch()}
        sort={query.sort}
        onSortChange={(sort) => set('sort', sort)}
        onPageChange={(page) => set('page', String(page))}
        emptyTitle="No audit entries match"
        toolbar={
          <>
            <Input
              type="search"
              aria-label="Search audit log"
              placeholder="Search action, record or ID"
              className="sm:max-w-64"
              defaultValue={query.search}
              onKeyDown={(e) =>
                e.key === 'Enter' && set('search', e.currentTarget.value.trim() || undefined)
              }
            />
            <Input
              aria-label="Filter by record type"
              placeholder="Record type (e.g. user)"
              className="sm:max-w-48"
              defaultValue={query.filter.entity}
              onKeyDown={(e) =>
                e.key === 'Enter' && set('entity', e.currentTarget.value.trim() || undefined)
              }
            />
          </>
        }
      />
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.action}</DialogTitle>
            <DialogDescription>
              {selected &&
                `${formatDateTime(selected.createdAt)} · ${selected.actor?.name ?? 'System / public'} · trace ${selected.traceId ?? '—'}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['before', 'after'] as const).map((key) => (
              <div key={key}>
                <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">{key}</p>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {json(selected?.[key])}
                </pre>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
