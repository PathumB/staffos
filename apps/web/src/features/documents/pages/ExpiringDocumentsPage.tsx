import { type Document, DOCUMENT_TYPE_LABELS } from '@staffos/shared';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/input';
import { useListParams } from '@/lib/list-params';
import { useExpiringDocuments } from '../api';

/** US-DOCS-02: HR's renewal list (expired first, then soonest). */
export function ExpiringDocumentsPage() {
  const { get, update } = useListParams();
  const days = Number(get('days') ?? 30);
  const docs = useExpiringDocuments(days);

  const columns = useMemo<DataTableColumn<Document>[]>(
    () => [
      {
        id: 'employee',
        header: 'Employee',
        enableHiding: false,
        meta: { label: 'Employee' },
        cell: ({ row }) => (
          <Link
            to={`/employees/${row.original.ownerId}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {row.original.ownerName}
          </Link>
        ),
      },
      {
        id: 'type',
        header: 'Document',
        meta: { label: 'Document' },
        cell: ({ row }) => (
          <span>
            {DOCUMENT_TYPE_LABELS[row.original.type]}
            {row.original.number && (
              <span className="text-muted-foreground"> · {row.original.number}</span>
            )}
          </span>
        ),
      },
      {
        id: 'expiry',
        header: 'Expiry',
        meta: { label: 'Expiry' },
        cell: ({ row }) => (
          <span className="flex items-center gap-2 whitespace-nowrap">
            {row.original.expiryDate}
            <Badge variant={row.original.expiryStatus === 'EXPIRED' ? 'destructive' : 'warning'}>
              {row.original.expiryStatus === 'EXPIRED' ? 'Expired' : 'Expiring'}
            </Badge>
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Expiring documents"
        description="Passports, visas, Emirates IDs, labour cards and medicals that need renewing. HR is also alerted 30 and 7 days before expiry."
      />
      <DataTable
        columns={columns}
        data={docs.data}
        meta={
          docs.data
            ? { page: 1, pageSize: docs.data.length || 1, total: docs.data.length }
            : undefined
        }
        isLoading={docs.isPending}
        error={docs.error}
        onRetry={() => void docs.refetch()}
        sort="expiry"
        onSortChange={() => undefined}
        onPageChange={() => undefined}
        emptyTitle="Nothing expiring"
        emptyDescription="No tracked documents expire in this window."
        toolbar={
          <NativeSelect
            aria-label="Window"
            className="sm:w-44"
            value={String(days)}
            onChange={(e) => update({ days: e.target.value })}
          >
            <option value="7">Next 7 days</option>
            <option value="30">Next 30 days</option>
            <option value="90">Next 90 days</option>
          </NativeSelect>
        }
      />
    </>
  );
}
