import type { Candidate } from '@staffos/shared';
import { UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDateTime } from '@/lib/format';
import { useListParams } from '@/lib/list-params';
import { useCandidates } from '../api';
import { CandidateFormDialog } from '../components/CandidateFormDialog';

export function CandidatesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { get, update } = useListParams();
  const [search, setSearch] = useState(get('search') ?? '');
  const [creating, setCreating] = useState(false);
  const query = {
    page: Number(get('page') ?? 1),
    pageSize: 20,
    sort: get('sort') ?? '-createdAt',
    search: get('search'),
  };
  const candidates = useCandidates(query);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== (get('search') ?? '')) update({ search: search.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const columns = useMemo<DataTableColumn<Candidate>[]>(
    () => [
      {
        id: 'name',
        header: 'Candidate',
        enableHiding: false,
        meta: { sortKey: 'lastName', label: 'Candidate' },
        cell: ({ row }) => (
          <div className="min-w-40">
            <Link
              to={`/candidates/${row.original.id}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {row.original.firstName} {row.original.lastName}
            </Link>
            <div className="text-xs text-muted-foreground">{row.original.currentTitle ?? '—'}</div>
          </div>
        ),
      },
      {
        id: 'skills',
        header: 'Top skills',
        meta: { label: 'Top skills' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.skills
              .slice(0, 3)
              .map((s) => s.name)
              .join(', ') || '—'}
          </span>
        ),
      },
      {
        id: 'experience',
        header: 'Experience',
        meta: { label: 'Experience' },
        cell: ({ row }) =>
          row.original.totalExperienceMonths === null
            ? '—'
            : `${Math.round(row.original.totalExperienceMonths / 12)} yrs`,
      },
      {
        id: 'applications',
        header: 'Applications',
        meta: { label: 'Applications' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.applicationCount}</span>,
      },
      {
        id: 'createdAt',
        header: 'Added',
        meta: { sortKey: 'createdAt', label: 'Added' },
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
        title="Candidates"
        description="People in your talent pool."
        actions={
          can('candidates:write') && (
            <Button onClick={() => setCreating(true)}>
              <UserPlus aria-hidden />
              New candidate
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={candidates.data?.data}
        meta={candidates.data?.meta}
        isLoading={candidates.isPending}
        error={candidates.error}
        onRetry={() => void candidates.refetch()}
        sort={query.sort}
        onSortChange={(sort) => update({ sort })}
        onPageChange={(page) => update({ page: String(page) })}
        emptyTitle="No candidates found"
        toolbar={
          <Input
            type="search"
            aria-label="Search candidates"
            placeholder="Search name, email, title or skill"
            className="sm:max-w-72"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
      />
      <CandidateFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(c) => navigate(`/candidates/${c.id}`)}
      />
    </>
  );
}
