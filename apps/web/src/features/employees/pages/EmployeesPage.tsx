import { EMPLOYEE_STATUS_LABELS, type Employee, type EmployeeStatus } from '@staffos/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Input, NativeSelect } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { useListParams } from '@/lib/list-params';
import { useDepartments, useEmployees } from '../api';
import { EmployeeStatusBadge } from '../components/badges';

export function EmployeesPage() {
  const { user } = useAuth();
  // An employee only ever sees themselves: go straight to their profile.
  const selfOnly =
    user?.employeeId && user.roles.every((r) => r === 'EMPLOYEE') ? user.employeeId : null;
  if (selfOnly) return <Navigate to={`/employees/${selfOnly}`} replace />;
  return <EmployeesTable />;
}

function EmployeesTable() {
  const { get, update } = useListParams();
  const [search, setSearch] = useState(get('search') ?? '');
  const departments = useDepartments();
  const query = {
    page: Number(get('page') ?? 1),
    pageSize: 20,
    sort: get('sort') ?? '-createdAt',
    search: get('search'),
    filter: {
      status: get('status') as EmployeeStatus | undefined,
      departmentId: get('department'),
    },
  };
  const employees = useEmployees(query);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== (get('search') ?? '')) update({ search: search.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const columns = useMemo<DataTableColumn<Employee>[]>(
    () => [
      {
        id: 'name',
        header: 'Employee',
        enableHiding: false,
        meta: { sortKey: 'lastName', label: 'Employee' },
        cell: ({ row }) => (
          <div className="min-w-40">
            <Link
              to={`/employees/${row.original.id}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {row.original.firstName} {row.original.lastName}
            </Link>
            <div className="text-xs text-muted-foreground">{row.original.employeeNumber}</div>
          </div>
        ),
      },
      {
        id: 'role',
        header: 'Position',
        meta: { label: 'Position' },
        cell: ({ row }) => (
          <div>
            {row.original.position?.title ?? '—'}
            <div className="text-xs text-muted-foreground">
              {row.original.department?.name ?? ''}
            </div>
          </div>
        ),
      },
      {
        id: 'client',
        header: 'Hired for',
        meta: { label: 'Hired for' },
        cell: ({ row }) =>
          row.original.job ? (
            <span className="text-muted-foreground">{row.original.job.client}</span>
          ) : (
            '—'
          ),
      },
      {
        id: 'onboarding',
        header: 'Onboarding',
        meta: { label: 'Onboarding' },
        cell: ({ row }) => {
          const o = row.original.onboarding;
          if (!o) return '—';
          return o.status === 'COMPLETED' ? (
            'Complete'
          ) : (
            <span className="tabular-nums">
              {o.done}/{o.total}
            </span>
          );
        },
      },
      {
        id: 'hireDate',
        header: 'Start date',
        meta: { sortKey: 'hireDate', label: 'Start date' },
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.hireDate}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => <EmployeeStatusBadge status={row.original.status} />,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Employees" description="People hired through StaffOS and their status." />
      <DataTable
        columns={columns}
        data={employees.data?.data}
        meta={employees.data?.meta}
        isLoading={employees.isPending}
        error={employees.error}
        onRetry={() => void employees.refetch()}
        sort={query.sort}
        onSortChange={(sort) => update({ sort })}
        onPageChange={(page) => update({ page: String(page) })}
        emptyTitle="No employees found"
        emptyDescription="Employees are created when a candidate is hired."
        toolbar={
          <>
            <Input
              type="search"
              aria-label="Search employees"
              placeholder="Search name, email or number"
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
              {Object.entries(EMPLOYEE_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Filter by department"
              className="sm:w-44"
              value={query.filter.departmentId ?? ''}
              onChange={(e) => update({ department: e.target.value || undefined })}
            >
              <option value="">All departments</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </>
        }
      />
    </>
  );
}
