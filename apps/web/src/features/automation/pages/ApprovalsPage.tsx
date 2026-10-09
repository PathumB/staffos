import { type Approval, ROLE_LABELS } from '@staffos/shared';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';
import { useListParams } from '@/lib/list-params';
import { useMyApprovals } from '../api';

/** US-WF-01: approvals waiting on one of my roles. The decision is made on the record itself. */
export function ApprovalsPage() {
  const { get, update } = useListParams();
  const page = Number(get('page') ?? 1);
  const approvals = useMyApprovals(page);

  const columns = useMemo<DataTableColumn<Approval>[]>(
    () => [
      {
        id: 'title',
        header: 'Waiting for approval',
        enableHiding: false,
        meta: { label: 'Item' },
        cell: ({ row }) => (
          <Link to={row.original.link} className="font-medium text-primary hover:underline">
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        meta: { label: 'Type' },
        cell: ({ row }) => (
          <Badge variant="secondary">
            {row.original.subject === 'OFFER' ? 'Offer' : 'Manpower request'}
          </Badge>
        ),
      },
      {
        id: 'step',
        header: 'Step',
        meta: { label: 'Step' },
        cell: ({ row }) => (
          <span>
            {row.original.currentStep}/{row.original.totalSteps} · {row.original.currentStepName}
            {row.original.currentRole && (
              <span className="text-muted-foreground">
                {' '}
                ({ROLE_LABELS[row.original.currentRole]})
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'workflow',
        header: 'Workflow',
        meta: { label: 'Workflow' },
        cell: ({ row }) => row.original.workflow.name,
      },
      {
        id: 'since',
        header: 'Since',
        meta: { label: 'Since' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="My approvals"
        description="Approval chain steps waiting on your role. Open an item to approve or reject it."
      />
      <DataTable
        columns={columns}
        data={approvals.data?.data}
        meta={approvals.data?.meta}
        isLoading={approvals.isPending}
        error={approvals.error}
        onRetry={() => void approvals.refetch()}
        sort="-createdAt"
        onSortChange={() => undefined}
        onPageChange={(p) => update({ page: String(p) })}
        emptyTitle="Nothing waiting for you"
      />
    </>
  );
}
