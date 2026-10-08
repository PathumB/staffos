import {
  formatMinutes,
  mondayOf,
  type Timesheet,
  TIMESHEET_STATUS_LABELS,
  type TimesheetStatus,
} from '@staffos/shared';
import { CheckCheck, Loader2, Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { useListParams } from '@/lib/list-params';
import { useBulkApprove, useCreateTimesheet, useDeployments, useTimesheets } from '../api';
import { TimesheetStatusBadge } from '../components/TimesheetStatusBadge';

export function TimesheetsPage() {
  const { can } = useAuth();
  const approver = can('timesheets:approve');
  const { get, update } = useListParams();
  const [creating, setCreating] = useState(false);
  // Approvers land on what needs their decision.
  const status = (get('status') ?? (approver ? 'SUBMITTED' : 'ALL')) as TimesheetStatus | 'ALL';
  const query = {
    page: Number(get('page') ?? 1),
    pageSize: 20,
    sort: get('sort') ?? '-weekStart',
    filter: { status: status === 'ALL' ? undefined : status },
  };
  const timesheets = useTimesheets(query);
  const bulk = useBulkApprove();
  const submitted = timesheets.data?.data.filter((t) => t.status === 'SUBMITTED') ?? [];

  const columns = useMemo<DataTableColumn<Timesheet>[]>(
    () => [
      {
        id: 'weekStart',
        header: 'Week of',
        enableHiding: false,
        meta: { sortKey: 'weekStart', label: 'Week of' },
        cell: ({ row }) => (
          <Link
            to={`/timesheets/${row.original.id}`}
            className="font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline"
          >
            {row.original.weekStart}
          </Link>
        ),
      },
      {
        id: 'employee',
        header: 'Employee',
        meta: { label: 'Employee' },
        cell: ({ row }) => row.original.employee.name,
      },
      {
        id: 'client',
        header: 'Client · project',
        meta: { label: 'Client and project' },
        cell: ({ row }) => (
          <div>
            {row.original.client.name}
            <div className="text-xs text-muted-foreground">{row.original.project}</div>
          </div>
        ),
      },
      {
        id: 'hours',
        header: 'Hours',
        meta: { label: 'Hours' },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatMinutes(row.original.totalMinutes)}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => <TimesheetStatusBadge status={row.original.status} />,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Timesheets"
        description={
          approver
            ? 'Weekly hours submitted for approval. Approved hours are invoiced.'
            : 'Weekly hours per deployment.'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {approver && submitted.length > 0 && (
              <Button
                variant="outline"
                disabled={bulk.isPending}
                onClick={async () => {
                  try {
                    const results = await bulk.mutateAsync(submitted.map((t) => t.id));
                    const ok = results.filter((r) => r.ok).length;
                    toast.success(`${ok} timesheet${ok === 1 ? '' : 's'} approved.`);
                    if (ok < results.length)
                      toast.warning(`${results.length - ok} could not be approved.`);
                  } catch (error) {
                    toast.error(
                      error instanceof ApiClientError ? error.message : 'Approval failed.',
                    );
                  }
                }}
              >
                {bulk.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <CheckCheck aria-hidden />
                )}
                Approve {submitted.length} shown
              </Button>
            )}
            {can('timesheets:write') && (
              <Button onClick={() => setCreating(true)}>
                <Plus aria-hidden />
                New timesheet
              </Button>
            )}
          </div>
        }
      />
      <DataTable
        columns={columns}
        data={timesheets.data?.data}
        meta={timesheets.data?.meta}
        isLoading={timesheets.isPending}
        error={timesheets.error}
        onRetry={() => void timesheets.refetch()}
        sort={query.sort}
        onSortChange={(sort) => update({ sort })}
        onPageChange={(page) => update({ page: String(page) })}
        emptyTitle={status === 'SUBMITTED' ? 'Nothing waiting for approval' : 'No timesheets'}
        toolbar={
          <NativeSelect
            aria-label="Filter by status"
            className="sm:w-40"
            value={status}
            onChange={(e) => update({ status: e.target.value })}
          >
            <option value="ALL">All statuses</option>
            {Object.entries(TIMESHEET_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        }
      />
      {creating && <NewTimesheetDialog onClose={() => setCreating(false)} />}
    </>
  );
}

/** Pick a deployment and week; the timesheet opens in the editor as a draft. */
function NewTimesheetDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const navigate = useNavigate();
  const deployments = useDeployments({
    pageSize: 100,
    sort: '-startDate',
    filter: { status: 'ACTIVE' },
  });
  const create = useCreateTimesheet();
  const [deploymentId, setDeploymentId] = useState('');
  const [week, setWeek] = useState(mondayOf(new Date().toISOString().slice(0, 10)));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!deploymentId) return setError('Choose a deployment.');
    try {
      const sheet = await create.mutateAsync({
        deploymentId,
        weekStart: mondayOf(week),
        entries: [],
      });
      onClose();
      navigate(`/timesheets/${sheet.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New timesheet</DialogTitle>
          <DialogDescription>Weeks run Monday to Sunday.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-dep`}>Deployment</Label>
            <NativeSelect
              id={`${id}-dep`}
              value={deploymentId}
              onChange={(e) => setDeploymentId(e.target.value)}
              disabled={deployments.isPending}
            >
              <option value="">{deployments.isPending ? 'Loading…' : 'Select'}</option>
              {deployments.data?.data.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.employee.name} · {d.client.name} ({d.project.name})
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-week`}>Any day in the week</Label>
            <Input
              id={`${id}-week`}
              type="date"
              value={week}
              onChange={(e) => setWeek(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Week starting {week ? mondayOf(week) : '—'}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={create.isPending || !week}>
            {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
