import {
  type OnboardingPlan,
  type OnboardingPlanStatus,
  PLAN_STATUS_LABELS,
} from '@staffos/shared';
import { ListChecks } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { useListParams } from '@/lib/list-params';
import { usePlans } from '../api';

export function OnboardingPage() {
  const { can } = useAuth();
  const { get, update } = useListParams();
  const [search, setSearch] = useState(get('search') ?? '');
  // Default to the plans that still need work.
  const status = (get('status') ?? 'IN_PROGRESS') as OnboardingPlanStatus | 'ALL';
  const query = {
    page: Number(get('page') ?? 1),
    pageSize: 20,
    sort: get('sort') ?? 'startDate',
    search: get('search'),
    filter: { status: status === 'ALL' ? undefined : status },
  };
  const plans = usePlans(query);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== (get('search') ?? '')) update({ search: search.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const columns = useMemo<DataTableColumn<OnboardingPlan>[]>(
    () => [
      {
        id: 'employee',
        header: 'Employee',
        enableHiding: false,
        meta: { label: 'Employee' },
        cell: ({ row }) => (
          <div className="min-w-40">
            <Link
              to={`/onboarding/${row.original.id}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {row.original.employee.name}
            </Link>
            <div className="text-xs text-muted-foreground">
              {row.original.employee.employeeNumber}
            </div>
          </div>
        ),
      },
      {
        id: 'startDate',
        header: 'Start date',
        meta: { sortKey: 'startDate', label: 'Start date' },
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.startDate}</span>,
      },
      {
        id: 'progress',
        header: 'Progress',
        meta: { label: 'Progress' },
        cell: ({ row }) => {
          const p = row.original.progress;
          return (
            <span className="tabular-nums">
              {p.done}/{p.total}
              {p.overdue > 0 && <span className="text-destructive"> · {p.overdue} overdue</span>}
            </span>
          );
        },
      },
      {
        id: 'template',
        header: 'Checklist',
        meta: { label: 'Checklist' },
        cell: ({ row }) => row.original.template?.name ?? '—',
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'COMPLETED' ? 'success' : 'secondary'}>
            {PLAN_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Onboarding"
        description="New hires' checklists: documents, medical, visa and induction."
        actions={
          can('onboarding-templates:manage') && (
            <Button variant="outline" asChild>
              <Link to="/onboarding/templates">
                <ListChecks aria-hidden />
                Checklists
              </Link>
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={plans.data?.data}
        meta={plans.data?.meta}
        isLoading={plans.isPending}
        error={plans.error}
        onRetry={() => void plans.refetch()}
        sort={query.sort}
        onSortChange={(sort) => update({ sort })}
        onPageChange={(page) => update({ page: String(page) })}
        emptyTitle="No onboarding plans"
        emptyDescription="A plan is created automatically when a candidate is hired."
        toolbar={
          <>
            <Input
              type="search"
              aria-label="Search plans"
              placeholder="Search name or number"
              className="sm:max-w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <NativeSelect
              aria-label="Filter by status"
              className="sm:w-40"
              value={status}
              onChange={(e) => update({ status: e.target.value })}
            >
              {Object.entries(PLAN_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
              <option value="ALL">All statuses</option>
            </NativeSelect>
          </>
        }
      />
    </>
  );
}
