import {
  type Client,
  type ClientStatus,
  EMIRATE_LABELS,
  type Industry,
  INDUSTRY_LABELS,
} from '@staffos/shared';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { useListParams } from '@/lib/list-params';
import { useClients } from '../api';
import { ClientFormDialog } from '../components/ClientFormDialog';

export const CLIENT_STATUS_VARIANT = {
  ACTIVE: 'success',
  PROSPECT: 'warning',
  INACTIVE: 'secondary',
} as const;

export function ClientsPage() {
  const { can } = useAuth();
  const { get, update } = useListParams();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState(get('search') ?? '');

  const query = {
    page: Number(get('page') ?? 1),
    pageSize: 20,
    sort: get('sort') ?? 'name',
    search: get('search'),
    filter: {
      industry: get('industry') as Industry | undefined,
      status: get('status') as ClientStatus | undefined,
    },
  };
  const clients = useClients(query);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== (get('search') ?? '')) update({ search: search.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const columns = useMemo<DataTableColumn<Client>[]>(
    () => [
      {
        id: 'name',
        header: 'Client',
        enableHiding: false,
        meta: { sortKey: 'name', label: 'Client' },
        cell: ({ row }) => (
          <Link
            to={`/clients/${row.original.id}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'industry',
        header: 'Industry',
        meta: { label: 'Industry' },
        cell: ({ row }) => INDUSTRY_LABELS[row.original.industry],
      },
      {
        id: 'location',
        header: 'Location',
        meta: { label: 'Location' },
        cell: ({ row }) => `${row.original.city}, ${EMIRATE_LABELS[row.original.emirate]}`,
      },
      {
        id: 'accountManager',
        header: 'Account manager',
        meta: { label: 'Account manager' },
        cell: ({ row }) => row.original.accountManager.name,
      },
      {
        id: 'openRequests',
        header: 'Open requests',
        meta: { label: 'Open requests' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.openRequests}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => (
          <Badge variant={CLIENT_STATUS_VARIANT[row.original.status]}>
            {row.original.status.toLowerCase()}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Clients"
        description="Companies we supply workers to."
        actions={
          can('clients:write') && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus aria-hidden />
              New client
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={clients.data?.data}
        meta={clients.data?.meta}
        isLoading={clients.isPending}
        error={clients.error}
        onRetry={() => void clients.refetch()}
        sort={query.sort}
        onSortChange={(sort) => update({ sort })}
        onPageChange={(page) => update({ page: String(page) })}
        emptyTitle="No clients found"
        emptyDescription={
          can('clients:write') ? 'Create your first client to start logging requests.' : undefined
        }
        toolbar={
          <>
            <Input
              type="search"
              aria-label="Search clients"
              placeholder="Search name or TRN"
              className="sm:max-w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <NativeSelect
              aria-label="Filter by industry"
              className="sm:w-48"
              value={query.filter.industry ?? ''}
              onChange={(e) => update({ industry: e.target.value || undefined })}
            >
              <option value="">All industries</option>
              {Object.entries(INDUSTRY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Filter by status"
              className="sm:w-36"
              value={query.filter.status ?? ''}
              onChange={(e) => update({ status: e.target.value || undefined })}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PROSPECT">Prospect</option>
              <option value="INACTIVE">Inactive</option>
            </NativeSelect>
          </>
        }
      />
      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}
