import { type Job, type JobStatus } from '@staffos/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Input, NativeSelect } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDateTime } from '@/lib/format';
import { useListParams } from '@/lib/list-params';
import { useJobs } from '../api';
import { JOB_STATUS_LABELS, JobStatusBadge } from '../components/badges';

export function JobsPage() {
  const { user } = useAuth();
  const { get, update } = useListParams();
  const [search, setSearch] = useState(get('search') ?? '');
  const mine = get('mine') === '1';
  const query = {
    page: Number(get('page') ?? 1),
    pageSize: 20,
    sort: get('sort') ?? '-createdAt',
    search: get('search'),
    filter: {
      status: get('status') as JobStatus | undefined,
      recruiterId: mine ? user?.id : undefined,
    },
  };
  const jobs = useJobs(query);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== (get('search') ?? '')) update({ search: search.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const columns = useMemo<DataTableColumn<Job>[]>(
    () => [
      {
        id: 'title',
        header: 'Job',
        enableHiding: false,
        meta: { sortKey: 'title', label: 'Job' },
        cell: ({ row }) => (
          <Link
            to={`/jobs/${row.original.id}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {row.original.title}
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
        id: 'location',
        header: 'Location',
        meta: { label: 'Location' },
        cell: ({ row }) => row.original.location,
      },
      {
        id: 'headcount',
        header: 'Headcount',
        meta: { label: 'Headcount' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.headcount}</span>,
      },
      {
        id: 'applicants',
        header: 'Applicants',
        meta: { label: 'Applicants' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.applicationCount}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => <JobStatusBadge status={row.original.status} />,
      },
      {
        id: 'publishedAt',
        header: 'Published',
        meta: { sortKey: 'publishedAt', label: 'Published' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDateTime(row.original.publishedAt)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Jobs" description="Open roles, opened from approved manpower requests." />
      <DataTable
        columns={columns}
        data={jobs.data?.data}
        meta={jobs.data?.meta}
        isLoading={jobs.isPending}
        error={jobs.error}
        onRetry={() => void jobs.refetch()}
        sort={query.sort}
        onSortChange={(sort) => update({ sort })}
        onPageChange={(page) => update({ page: String(page) })}
        emptyTitle="No jobs found"
        emptyDescription="Jobs are opened from approved manpower requests."
        toolbar={
          <>
            <Input
              type="search"
              aria-label="Search jobs"
              placeholder="Search title, location or client"
              className="sm:max-w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <NativeSelect
              aria-label="Filter by status"
              className="sm:w-36"
              value={query.filter.status ?? ''}
              onChange={(e) => update({ status: e.target.value || undefined })}
            >
              <option value="">All statuses</option>
              {Object.entries(JOB_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
            {user?.roles.includes('RECRUITER') && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={mine}
                  onChange={(e) => update({ mine: e.target.checked ? '1' : undefined })}
                />
                Assigned to me
              </label>
            )}
          </>
        }
      />
    </>
  );
}
