import {
  INTERVIEW_MODE_LABELS,
  INTERVIEW_STATUS_LABELS,
  type Interview,
  type InterviewStatus,
} from '@staffos/shared';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { NativeSelect } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDateTime } from '@/lib/format';
import { useListParams } from '@/lib/list-params';
import { useInterviews } from '../api';
import { InterviewStatusBadge } from '../components/badges';

/** Upcoming and past interviews the user may see; "Only mine" = where I'm on the panel. */
export function InterviewsPage() {
  const { user } = useAuth();
  const { get, update } = useListParams();
  const mine = get('mine') === '1';
  // Default to what needs attention: interviews still to happen or to score.
  const status = (get('status') ?? 'SCHEDULED') as InterviewStatus | 'ALL';
  const query = {
    page: Number(get('page') ?? 1),
    pageSize: 20,
    sort: get('sort') ?? 'scheduledAt',
    filter: {
      status: status === 'ALL' ? undefined : status,
      interviewerId: mine ? user?.id : undefined,
    },
  };
  const interviews = useInterviews(query);

  const columns = useMemo<DataTableColumn<Interview>[]>(
    () => [
      {
        id: 'scheduledAt',
        header: 'When (Dubai)',
        enableHiding: false,
        meta: { sortKey: 'scheduledAt', label: 'When' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDateTime(row.original.scheduledAt)}</span>
        ),
      },
      {
        id: 'candidate',
        header: 'Candidate',
        meta: { label: 'Candidate' },
        cell: ({ row }) => (
          <Link
            to={`/applications/${row.original.applicationId}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {row.original.candidate.name}
          </Link>
        ),
      },
      {
        id: 'job',
        header: 'Job',
        meta: { label: 'Job' },
        cell: ({ row }) => row.original.job.title,
      },
      {
        id: 'mode',
        header: 'Format',
        meta: { label: 'Format' },
        cell: ({ row }) =>
          `${INTERVIEW_MODE_LABELS[row.original.mode]} · ${row.original.durationMin} min`,
      },
      {
        id: 'panel',
        header: 'Panel',
        meta: { label: 'Panel' },
        cell: ({ row }) => {
          const p = row.original.interviewers;
          return (
            <span className="text-muted-foreground">
              {p.map((i) => i.name).join(', ')} ({p.filter((i) => i.submitted).length}/{p.length}{' '}
              scored)
            </span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => <InterviewStatusBadge status={row.original.status} />,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Interviews" description="Interviews on jobs you work on or sit on." />
      <DataTable
        columns={columns}
        data={interviews.data?.data}
        meta={interviews.data?.meta}
        isLoading={interviews.isPending}
        error={interviews.error}
        onRetry={() => void interviews.refetch()}
        sort={query.sort}
        onSortChange={(sort) => update({ sort })}
        onPageChange={(page) => update({ page: String(page) })}
        emptyTitle="No interviews"
        emptyDescription="Interviews are scheduled from an application in the Interview stage."
        toolbar={
          <>
            <NativeSelect
              aria-label="Filter by status"
              className="sm:w-40"
              value={status}
              onChange={(e) => update({ status: e.target.value })}
            >
              {Object.entries(INTERVIEW_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
              <option value="ALL">All statuses</option>
            </NativeSelect>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={mine}
                onChange={(e) => update({ mine: e.target.checked ? '1' : undefined })}
              />
              Only where I&apos;m interviewing
            </label>
          </>
        }
      />
    </>
  );
}
