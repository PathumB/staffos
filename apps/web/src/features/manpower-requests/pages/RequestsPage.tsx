import {
  JOB_CATEGORY_LABELS,
  type JobCategory,
  type ManpowerRequest,
  type ManpowerRequestStatus,
} from '@staffos/shared';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDateTime } from '@/lib/format';
import { useListParams } from '@/lib/list-params';
import { useRequests } from '../api';
import { RequestFormDialog } from '../components/RequestFormDialog';
import { REQUEST_STATUS_LABELS, RequestStatusBadge } from '../components/status';

export function RequestsPage() {
  const { can, user } = useAuth();
  const { get, update } = useListParams();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState(get('search') ?? '');

  const query = {
    page: Number(get('page') ?? 1),
    pageSize: 20,
    sort: get('sort') ?? '-createdAt',
    search: get('search'),
    filter: {
      status: get('status') as ManpowerRequestStatus | undefined,
      category: get('category') as JobCategory | undefined,
      clientId: get('clientId'),
    },
  };
  const requests = useRequests(query);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== (get('search') ?? '')) update({ search: search.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const columns = useMemo<DataTableColumn<ManpowerRequest>[]>(
    () => [
      {
        id: 'role',
        header: 'Role',
        enableHiding: false,
        meta: { label: 'Role' },
        cell: ({ row }) => (
          <Link
            to={`/requests/${row.original.id}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {row.original.roleTitle}
          </Link>
        ),
      },
      {
        id: 'client',
        header: 'Client',
        meta: { label: 'Client' },
        cell: ({ row }) => row.original.client.name,
      },
      {
        id: 'headcount',
        header: 'Headcount',
        meta: { sortKey: 'headcount', label: 'Headcount' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.headcount}</span>,
      },
      {
        id: 'startDate',
        header: 'Start',
        meta: { sortKey: 'startDate', label: 'Start' },
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.startDate}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => <RequestStatusBadge status={row.original.status} />,
      },
      {
        id: 'createdAt',
        header: 'Created',
        meta: { sortKey: 'createdAt', label: 'Created' },
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
        title="Manpower requests"
        description={
          user?.clientId
            ? 'Workers your company has asked for.'
            : 'Client demand, from request to approval.'
        }
        actions={
          can('manpower-requests:write') && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus aria-hidden />
              New request
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={requests.data?.data}
        meta={requests.data?.meta}
        isLoading={requests.isPending}
        error={requests.error}
        onRetry={() => void requests.refetch()}
        sort={query.sort}
        onSortChange={(sort) => update({ sort })}
        onPageChange={(page) => update({ page: String(page) })}
        emptyTitle="No requests found"
        emptyDescription="New client requests appear here."
        toolbar={
          <>
            <Input
              type="search"
              aria-label="Search requests"
              placeholder="Search role, location or client"
              className="sm:max-w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <NativeSelect
              aria-label="Filter by status"
              className="sm:w-48"
              value={query.filter.status ?? ''}
              onChange={(e) => update({ status: e.target.value || undefined })}
            >
              <option value="">All statuses</option>
              {Object.entries(REQUEST_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Filter by category"
              className="sm:w-40"
              value={query.filter.category ?? ''}
              onChange={(e) => update({ category: e.target.value || undefined })}
            >
              <option value="">All categories</option>
              {Object.entries(JOB_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </>
        }
      />
      <RequestFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}
